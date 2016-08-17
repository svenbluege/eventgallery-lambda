var async = require("async"),
	AWS = require("aws-sdk"),
	fs = require("fs"),
	im = require("gm").subClass({imageMagick: true}),
	s3 = new AWS.S3(),
	piexif = require("piexifjs");

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

	console.log(JSON.stringify(settings));



	async.mapLimit(settings.files, settings.concurrency,
		function(file, cb) {
			s3.getObject({
				"Bucket": settings.bucketOriginals,
				"Key": settings.folder + '/' + file
			}, function(err, data) {
				if (err) {
					console.log("Error getting data from s3" + err);
					cb(err);
				} else {
					console.log("Received the original file");
					im(data.Body).identify(function(err, value) {

						if (err) {
							console.log("Error during identify " + err);
							cb(err);
						}

						resultETags.original[file] = cleanETag(data.ETag);
						console.log("Identified the file");

						cb(null, {
							buffer: data.Body,
							file: file,
							width: value.size.width,
							height: value.size.height,
							folder: settings.folder,
							imageType: getImageType(data.ContentType),
							contentType: data.ContentType,
						});

					});
				}
			});
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

				// save the metadata
				if (image.imageType === FORMAT_JPEG) {
					var jpeg = image.buffer;
					var data = jpeg.toString("binary");
					var exifObj = piexif.load(data);
					exifObj['thumbnail'] = null;
					var exifbytes = piexif.dump(exifObj);
					jpeg = null;
					data = null;
					exifObj = null;
				}

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

						var newJpeg = buffer;

						if (image.imageType == FORMAT_JPEG) {
							newData = piexif.insert(exifbytes, buffer.toString("binary"));
							newJpeg = new Buffer(newData, "binary");
							newData = null;
						}

						var key = `${image.folder}/s${width}/${image.file}`;

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
								exifbytes = null;
								exifObj =  null;
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