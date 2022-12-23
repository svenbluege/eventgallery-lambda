import {ImageInfo, State} from "gm";

export const FORMAT_JPEG = "jpeg";
export const FORMAT_PNG = "png";

export function getImageType(objectContentType: String): String {
    if (objectContentType === "image/jpeg") {
        return FORMAT_JPEG;
    } else if (objectContentType === "image/png") {
        return FORMAT_PNG;
    } else {
        throw new Error("unsupported objectContentType " + objectContentType);
    }
}

export function getBufferOfImage(img, outputFormat?): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        img.toBuffer(outputFormat, (err, buffer) => {
            if (err) reject(err);
            resolve(buffer)
        })
    })
}

export function identifyImage(img: State): Promise<ImageInfo> {
    return new Promise((resolve, reject) => {
        img.identify(
            function (err, stdout) {
                if (err) {
                    reject(err)
                }
                resolve(stdout);
            });
    })
}

export function getExif(imgedata) {

    let focalLength: number;
    if (imgedata.Properties['exif:FocalLength'] as any) {
        let numbers = imgedata.Properties['exif:FocalLength'].split('/');
        focalLength = parseInt(numbers[0]) / parseInt(numbers[1]);
    }

    let fstop: number;
    if (imgedata.Properties['exif:FNumber']) {
        var numbers = imgedata.Properties['exif:FNumber'].split('/');
        fstop = parseInt(numbers[0]) / parseInt(numbers[1]);
    }

    return {
        'model': imgedata.Properties['exif:Model'],
        'focallength': focalLength,
        'fstop': fstop,
        'exposuretime': imgedata.Properties['exif:ExposureTime'],
        'iso': imgedata.Properties['exif:ISOSpeedRatings']
    }
}
