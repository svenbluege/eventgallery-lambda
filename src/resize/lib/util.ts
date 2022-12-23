export function stream2buffer(stream): Promise<Buffer> {

    return new Promise((resolve, reject) => {
        const _buf = [];
        stream.on("data", (chunk) => _buf.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(_buf)));
        stream.on("error", (err) => reject(err));

    });
}

/**
 * remove double quoutes at the beginning and the end of an etag
 */
export function cleanETag(etag: String): String {
    return etag.replace(/"/g, "");
}
