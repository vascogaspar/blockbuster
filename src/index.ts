import dotenv from "dotenv";
import fs from "fs";
import AWS, { AWSError } from "aws-sdk";
import express from "express";
import multer from "multer";
import morgan from "morgan";
import path from "path";
import { processFile, cleanup } from "./process";
import { getBucketUrl, logger } from "./utils";
import Upload from "./upload";
// @ts-ignore
import SSE from "express-sse";
const sse = new SSE();

dotenv.config();

const PORT = process.env.PORT || "8082";

const app = express();
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }))

const upload = multer({ dest: "dist/uploads/" });

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const Uploader = new Upload({
  s3,
  sse
});

const S3_URL = getBucketUrl();

app.get("/", async (req, res, next) => {
  try {
    const data = await s3
      .listObjects({
        Bucket: process.env.S3_BUCKET_NAME,
        Delimiter: "/"
      })
      .promise();
    const results = data.CommonPrefixes.map((p: any) => p.Prefix);

    if (results.length === 0) {
      return res.render("new-collection.ejs", { url: S3_URL });
    }

    res.render("index.ejs", { results, url: S3_URL });
  } catch (ex) {
    next(ex);
  }
});

app.get("/collections/:collection", async (req, res, next) => {
  const collection = req.params.collection;

  try {
    const data = await s3
      .listObjects({
        Bucket: process.env.S3_BUCKET_NAME,
        Delimiter: "/",
        Prefix: collection + "/"
      })
      .promise();
    const results = data.CommonPrefixes.map((p: any) => p.Prefix);
    res.render("collection.ejs", { results, url: S3_URL, collection });
  } catch (ex) {
    next(ex);
  }
});

app.post("/upload", upload.single("file"), (req, res) => {
  const { file } = req;
  const { collection } = req.body;
  const dir = path.resolve(`${__dirname}/uploads/temp-${file.filename}`);

  return processFile(file, dir, sse).then(async resp => {
    try {
      await Uploader.uploadFiles(file, dir, collection);
      return res.redirect("/collections/" + collection);
    } catch (ex) {
      await Uploader.abort(file, collection);
      console.error(ex)
      await cleanup(file, dir);
      return res.status(500).send("something went wrong, rolling back");
    }
  }).catch(e => {
     console.error('asdasdads',e)
     throw(e)
  });
});

app.get("/upload", (req, res) => {
  res.render("upload.ejs");
});

app.get("/preview", (req, res) => {
  const { url } = req.query;
  res.render("preview.ejs", { url });
});

app.get("/new-collection", (req, res) => {
  res.render("new-collection.ejs");
});

app.post("/new-collection", (req, res) => {
  const { project_name } = req.body;
  const reified_project_name = project_name.replace(/[^A-Z0-9]/gi, "_");
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: reified_project_name + "/",
    ACL: "public-read"
  };

  s3.putObject(params, (err, data) => {
    if (err) throw err;
    res.redirect("/");
  });
});

app.get("/stream", sse.init);

app.get("*", (req, res) => {
  res
    .status(404)
    .set("Content-Type", "text/plain")
    .send("imagine what you can do with all this real estate.");
});

app.listen(PORT, () =>
  console.log(`Blockbuster is listening on port ${PORT}!`)
);
