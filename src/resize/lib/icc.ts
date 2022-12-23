import {spawn} from "child_process";

const temp = require('temp')


export function getIccProfileFilePath(buffer: Buffer): Promise<String> {
    let iccProfileFilePath = temp.path({prefix: '', suffix: ".icc"})

    let convert = spawn('convert', [
        "-",
        "-verbose",
        "icc:" + iccProfileFilePath
    ]);

    convert.stdin.write(buffer);
    convert.stdin.end();

    return new Promise((resolve) => {
        convert.on('close', function (code) {
            if (code === 0) {
                resolve(iccProfileFilePath)
            } else {
                resolve(null)
            }
        });
    })
}

export function addIccProfile(iccProfileFilePath, imgBuffer): Promise<Buffer> {
    let commandsOptions = [
        "-",
        "-profile",
        iccProfileFilePath,
        "-"]
    let convert = spawn('convert', commandsOptions)
    let commandOutputBuffer = [];

    convert.stdio[1].on('data', (data) => {
        commandOutputBuffer.push(data);
    });

    convert.stdin.write(imgBuffer);
    convert.stdin.end();

    return new Promise((resolve, reject) => {
        convert.on('close', function (code) {
            if (code === 0) {
                resolve(Buffer.concat(commandOutputBuffer))
            } else {
                reject("error code: " + code)
            }
        });
    })
}
