import { logger } from "./utils";
import fs from "fs";
import path from "path";
import { File } from "./types";
import { AWSError } from "aws-sdk";
import { cleanup } from "./process";

interface Props {
  s3: any;
  sse: any;
}

class Upload {
  s3: any;
  sse: any;

  constructor(props: Props) {
    this.s3 = props.s3;
    this.sse = props.sse;
  }

  async uploadFiles(file: File, dir: string, collection: string) {
    const files = fs.readdirSync(dir);

    for (const f of files) {
      await logger(
        this.sse,
        "upload file " + file.filename + "/" + f,
        this.uploadFile(file, f, dir, collection)
      );
    }
  }

  abort(file: File, collection: string) {
    // @ts-ignore
    let params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: collection + "/" + file.filename + "/",
    };

    this.s3.listObjects(params, (err: AWSError, data: any) => {
      if (err) throw err;
      // @ts-ignore
      params = { Bucket: process.env.S3_BUCKET_NAME };
      // @ts-ignore
      params.Delete = { Objects: [] };
      // @ts-ignore
      data.Contents.forEach((content: any) => {
        // @ts-ignore
        params.Delete.Objects.push({ Key: content.Key });
      });
      // @ts-ignore
      this.s3.deleteObjects(params, (err2: AWSError, data2: any) => {
        if (err2) throw err2;
        console.log(data2);
      });
    });
  }

  private uploadFile(
    file: File,
    f: any,
    dir: string,
    collection: string
  ): Promise<boolean> {
    return new Promise((res, rej) => {
      const buffer = fs.readFileSync(`${dir}/${f}`);
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        TargetPrefix: "log/",
        Key: `${collection}/${file.filename}/${f}`,
        Body: buffer,
        ACL: "public-read"
      };
      this.s3.upload(params, (err: AWSError) => {
        if (err) {
          return rej();
        }
        res();
      });
    });
  }
}

export default Upload;
