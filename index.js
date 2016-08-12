var async = require("async");
var AWS = require("aws-sdk");
var fs = require("fs");
var im = require("gm").subClass({imageMagick: true});
var s3 = new AWS.S3();
var piexif = require("piexifjs");

var CONFIG = require("./config.json");

function cross(left, right) {
	var res = [];
	left.forEach(function(l) {
		right.forEach(function(r) {
			res.push([l, r]);
		});
	});
	return res;
}

exports.handler = function(event, context) {
	var defaults =  {
		bucketOriginals : "",
		bucketThumbnails : "",
		autorotate: true,
		sharpImage: true,
		sharpOriginalImage: false,
		doWatermark: false,
		watermark : {},
		sizes: [],
		folder: "",
		files: [],
		concurrency: 1
	}, settings = Object.assign({}, defaults, event);

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

						console.log("Identified the file");

						cb(null, {
							buffer: data.Body,
							file: file,
							width: value.size.width,
							height: value.size.height,
							folder: settings.folder,
							imageType: 'jpeg',
							contentType: data.ContentType,
						});

					});
				}
			});
			// read the images to memory
			/*fs.readFile(`${settings.folder}/${file}`, function (err, data) {
				if (err) {
					cb(err);
				} else {

					im(data).identify(function(err, value) {

						if (err) {
							cb(err);
						}

						cb(null, {
							buffer: data,
							file: file,
							width: value.size.width,
							height: value.size.height,
							folder: settings.folder,
							imageType: data.format
						});

					});
				}
			});*/

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
				var jpeg = image.buffer;
				var data = jpeg.toString("binary");
				var exifObj = piexif.load(data);
				exifObj['thumbnail'] = null;
				var exifbytes = piexif.dump(exifObj);
				jpeg = null;
				data = null;
				exifObj = null;

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
							.composite('watermark.jpg')
							.geometry('+100+150')
							.toBuffer(function(err, buffer) {
								callback(err, buffer);
							});
					},
					function(buffer, callback) {
						try {
							fs.mkdirSync(`${image.folder}/s${width}`);
						}catch(e) {}

						var newData = piexif.insert(exifbytes, buffer.toString("binary"));
						var newJpeg = new Buffer(newData, "binary");

						/*fs.writeFile(`${image.folder}/s${width}/${image.file}`, newJpeg, function(err) {
							callback(err);
						});*/

						console.log(`Uploading now to ${image.folder}/s${width}/${image.file}`);
						s3.putObject({
							"Bucket": settings.bucketThumbnails,
							"Key": `${image.folder}/s${width}/${image.file}`,
							"Body": newJpeg,
							"ContentType": image.contentType
						}, function(err) {
							console.log(`Uploading now to ${image.folder}/s${width}/${image.file} DONE`);
							callback(err, "Upload done");
						});

					}
				], function (err, result) {
					img = null;
					newJpeg = null;
					newData = null;
					exifbytes = null;
					exifObj =  null;
					cb(err, result);
				});

			}, function(err) {
				if (err) {
					console.log(err);
					context.fail(err);
				} else {
					context.succeed(null, "Resizing Done");
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