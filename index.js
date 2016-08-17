var async = require("async"),
	AWS = require("aws-sdk"),
	fs = require("fs"),
	im = require("gm").subClass({imageMagick: true}),
	s3 = new AWS.S3(),
	spawn = require('child_process').spawn,
	temp = require('temp');
	piexif = require("piexifjs");

//temp.track();

const FORMAT_JPEG = "jpeg";
const FORMAT_PNG = "png";

var CONFIG = require("./config.json");

function getImageType(objectContentType) {
	if (objectContentType === "image/jpeg") {
		return FORMAT_JPEG;
	} else if (objectContentType === "image/png") {
		return FORMAT_PNG;
	} else {
		throw new Error("unsupported objectContentType " + objectContentType);
	}
}

function cross(left, right) {
	var res = [];
	left.forEach(function(l) {
		right.forEach(function(r) {
			res.push([l, r]);
		});
	});
	return res;
}

/**
 * remove double quoutes at the beginning and the end of an etag
 *
 * @param $etag
 * @returns {void|XML|string|*}
 */
function cleanETag($etag) {
	return $etag.replace(/"/g, "");
}

exports.handler = function(event, context) {
	var defaults =  {
			bucketOriginals : "",
			bucketThumbnails : "",
			autorotate: true,
			sharpImage: true,
			sharpOriginalImage: false,
			doWatermark: false,
			watermark : {
				src : ""
			},
			sizes: [],
			folder: "",
			files: [],
			concurrency: 1,
			savelocal: false
		},
		settings = Object.assign({}, defaults, event),
		resultETags = {original: {}, thumbnails: {}};


	console.log(JSON.stringify(settings, null, 2));

	async.mapLimit(settings.files, settings.concurrency,
		function(file, cb) {

			async.waterfall(
				[
					function(callback) {
						s3.getObject({
								"Bucket": settings.bucketOriginals,
								"Key": settings.folder + '/' + file
							}, function(err, dataS3) {
								callback(err, dataS3);
							}
						);
					},
					function(dataS3, callback) {
						var img = im(dataS3.Body);
						img.identify(function(err, identifyData){
							callback(err, img, dataS3, identifyData);
						});
					},
					function(image, dataS3, identifyData, callback) {
						// save the ICC profile
						var iccProfile = {path: temp.path({prefix: file, suffix: ".icc"})},
							convert;

						// fixes strange windows issue with double backslash
						iccProfile['path'] = iccProfile['path'].replace(/\\/g,"\\");

						convert = spawn('convert', [
							"-",
							"-verbose",
							"icc:"+ iccProfile['path']

						]);

						convert.stdin.write(dataS3.Body);
						convert.stdin.end();

						var b1 = [];
						var b2 = [];
						convert.stdout.on('data', function(data){b1.push(data)})
						convert.stderr.on('data', function(data){b2.push(data)})

						convert.on('close', function (code) {

							console.log(Buffer.concat(b1).toString('ascii'));
							console.log(Buffer.concat(b2).toString('ascii'));

							if (code !== 0) {
								callback(null, image, dataS3, identifyData, undefined);
							} else {
								console.log(code, iccProfile['path']);
								callback(null, image, dataS3, identifyData, iccProfile);
							}
						});
					},
					function(image, dataS3, identifyData, iccProfile, callback) {
						var imageType = getImageType(dataS3.ContentType),
							exifBytes = null;

						resultETags.original[file] = cleanETag(dataS3.ETag);
						console.log("Identified the file " + file);

						// save the metadata
						{
							if (imageType === FORMAT_JPEG) {
								var jpeg = dataS3.Body,
									data = jpeg.toString("binary"),
									exifObj = piexif.load(data);

								delete exifObj['thumbnail'];
								exifBytes = piexif.dump(exifObj);

								jpeg = null;
								data = null;
								exifObj = null;
							}
						}

						callback(null, {
							buffer: dataS3.Body,
							file: file,
							width: identifyData.size.width,
							height: identifyData.size.height,
							folder: settings.folder,
							imageType: imageType,
							contentType: dataS3.ContentType,
							jpegExifBytes: exifBytes,
							iccProfile: iccProfile
						});
					}
				],function (err, result) {
					cb(err, result);
				}
			);
		},
		function(err, images){
			if (err) {
				context.fail(err);
				return;
			}

			console.log("Start the resizing process now");

			var resizePairs = cross(settings.sizes, images);
			async.eachLimit(resizePairs, settings.concurrency, function(resizePair, cb) {
				var width = resizePair[0],
					newWidth = width,
				 	image = resizePair[1],
				 	imagepath = `${image.folder}/${image.file}`,
					img;

				img = im(image.buffer);

				if (newWidth>image.width) {
					newWidth = image.width;
				}
				console.log(`Resizing ${imagepath} to size ${newWidth}.`);

				img.resize(newWidth);

				if (settings.autorotate) {
					img.autoOrient();
				}

				if (settings.sharpImage) {
					var doSharp = true;

					if (newWidth >= image.width && !settings.sharpOriginalImage) {
						doSharp = false;
					}

					if (doSharp) {
						img.unsharp(CONFIG.unsharp.radius, CONFIG.unsharp.sigma, CONFIG.unsharp.amount, CONFIG.unsharp.threshold );
						console.log(`Sharping ${imagepath} with size ` + JSON.stringify(CONFIG.unsharp));
					}
				}

				img.strip();

				async.waterfall([
					function(callback) {
						img.toBuffer(image.imageType, function(err, buffer) {
								callback(err, buffer);
						});
					},
					function(buffer, callback) {
						// Watermarking
						if (!settings.doWatermark) {
							callback(null, buffer);
							return;
						}
						console.log("do watermarking now");
						im(buffer)
							.composite(settings.watermark.src)
							.geometry('+100+150')
							.toBuffer(function(err, buffer) {
								callback(err, buffer);
							});
					},
					function(buffer, callback) {

						if (image.iccProfile !== undefined) {

								var commandsOptions = [
									"-",
									"-profile",
									image.iccProfile['path'],
									"-"],
								convert = spawn('convert', commandsOptions),
								newBuffer = [];

							convert.stdio[1].on('data', (data) => {
								newBuffer.push(data);
							});

							convert.stdin.write(buffer);
							convert.stdin.end();

							convert.on('close', function (code) {
								console.log('Finished writing ICC profile for ' + image.file);
								var result = Buffer.concat(newBuffer);

								if (code === 0) {
									callback(null, result);
								} else {
									callback("error code: " + code);
								}
							});
						} else {
							callback(null, buffer);
						}
					},
					function(buffer, callback) {

						var newJpeg = buffer,
							key = `${image.folder}/s${width}/${image.file}`;

						if (image.imageType == FORMAT_JPEG) {
							newData = piexif.insert(image.jpegExifBytes, buffer.toString("binary"));
							newJpeg = new Buffer(newData, "binary");
							newData = null;
						}

						console.log(`Uploading now to ${key}`);
						s3.putObject({
							"Bucket": settings.bucketThumbnails,
							"Key": key,
							"Body": newJpeg,
							"ContentType": image.contentType,
							"ACL": "public-read"
						}, function(err, data) {
							console.log(`Uploading now to ${key} DONE. ${err}`);

							if (!resultETags.thumbnails[image.file]) {
								resultETags.thumbnails[image.file] = {};
							}
							resultETags.thumbnails[image.file][key] = cleanETag(data.ETag);

							if (settings.savelocal) {
								try { fs.mkdirSync(`tmp`);} catch (e) {}
								try { fs.mkdirSync(`tmp/${image.folder}`);} catch (e) {}
								try { fs.mkdirSync(`tmp/${image.folder}/s${width}`);} catch (e) {}

								fs.writeFile(`tmp/${image.folder}/s${width}/${image.file}`, newJpeg, function (err) {
									callback(err);
								});
							} else {
								img = null;
								newJpeg = null;
								callback(err, "Done");
							}
						});

					}
				], function (err, result) {

					cb(err, result);
				});

			}, function(err) {

				if (err) {
					console.log(err);
					context.fail(err);
				} else {
					context.succeed(resultETags);
				}
			});
		}
	);

	/*

	
	async.mapLimit(event.Records, CONFIG.concurrency, function(record, cb) {
		var originalKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
		s3.getObject({
			"Bucket": record.s3.bucket.name,
			"Key": originalKey
		}, function(err, data) {
			if (err) {
				cb(err);
			} else {
				cb(null, {
					"originalKey": originalKey,
					"contentType": data.ContentType,
					"imageType": getImageType(data.ContentType),
					"buffer": data.Body,
					"record": record
				});
			}
		});
	}, function(err, images) {
		if (err) {
			context.fail(err);
		} else {
			var resizePairs = cross(CONFIG.sizes, images);
			async.eachLimit(resizePairs, CONFIG.concurrency, function(resizePair, cb) {
				var config = resizePair[0];
				var image = resizePair[1];
				im(image.buffer).resize(config).toBuffer(image.imageType, function(err, buffer) {
					if (err) {
						cb(err);
					} else {
						s3.putObject({
							"Bucket": image.record.s3.bucket.name.replace("-original", "-resized"),
							"Key": config + "/" + image.originalKey,
							"Body": buffer,
							"ContentType": image.contentType
						}, function(err) {
							cb(err);
						});
					}
				});
			}, function(err) {
				if (err) {
					context.fail(err);
				} else {
					context.succeed();
				}
			});
		}
	});
	*/
	
};