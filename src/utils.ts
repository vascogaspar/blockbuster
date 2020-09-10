export function getBucketUrl(): string {
  return (
    "https://" +
    process.env.S3_BUCKET_NAME +
    ".s3." +
    process.env.S3_BUCKET_REGION +
    ".amazonaws.com/"
  );
}

export function logger(
  sse: any,
  log: string,
  proc: Promise<unknown>
): Promise<unknown> {
  return new Promise((res, rej) => {
    sse.send("START " + log);
    proc
      .then(r => {
        sse.send("END " + log);
        res(r);
      })
      .catch(ex => {
        sse.send("FAILED " + log);
        rej(ex);
      });
  });
}
