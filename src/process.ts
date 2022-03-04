import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import rimraf from "rimraf";
import dedent from "dedent";
import { logger } from "./utils";
import { File } from "./types";

type Proc = (file: File, dir: string) => Promise<unknown>;

interface Process {
  log: string;
  proc: Proc;
}

// prettier-ignore
const resolutions = [
  { w: 640,  h: 360,  b: 800,  maxrate: "856k",  bufsize: "1200k", ba: "96k"  },
  { w: 842,  h: 480,  b: 1400, maxrate: "1498k", bufsize: "2100k", ba: "128k" },
  { w: 1280, h: 720,  b: 2800, maxrate: "2996k", bufsize: "4200k", ba: "128k" },
  { w: 1920, h: 1080, b: 5000, maxrate: "5350k", bufsize: "7500k", ba: "192k" }
];

function buildProcesses(list: Process[], sse: any, ...args: any) {
  return list.map(l => {
    return logger(sse, l.log, l.proc.apply(null, args));
  });
}

export function processFile(
  file: File,
  dir: string,
  sse: any
): Promise<unknown> {
  return new Promise((res, rej) => {
    // make dir
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    // prettier-ignore
    const processes: Process[] = [
      { proc: generatePlaylist,   log: "generate playlist"  },
      { proc: generateThumbnail,  log: "generate thumbnail" },
      { proc: generatePreviewGif, log: "generate preview"   },
      { proc: generateFragments,  log: "generate fragments" },
      { proc: extractMetadata,    log: "extract metadata"   },
      { proc: copyOriginal,       log: "copy original"      }
      // todo generate poster
    ];

    return Promise.all(buildProcesses(processes, sse, file, dir))
      .then(res)
      .catch(ex => {
        logger(sse, "clean everything", cleanup(file, dir));
        rej(ex);
      });
  });
}

export function cleanup(file: File, dir: string) {
  return new Promise((res, rej) => {
    try {
      fs.unlinkSync(file.path);
      rimraf.sync(dir);
      res();
    } catch (ex) {
      rej(ex);
    }
  });
}

function generatePlaylist(file: File, dir: string) {
  return new Promise((res, rej) => {
    const content = dedent`
    #EXTM3U
    #EXT-X-VERSION:3
    ${resolutions
      .map(
        // prettier-ignore
        r => `#EXT-X-STREAM-INF:BANDWIDTH=${r.b * 1000},RESOLUTION=${r.h}x${r.w}\n${r.h}p.m3u8`
      )
      .join("\n")}
    `;

    return fs.writeFile(`${dir}/playlist.m3u8`, content, err => {
      if (err) rej(err);
      res();
    });
  });
}

function generateThumbnail(file: File, dir: string) {
  const cmd = "ffmpeg";

  // prettier-ignore
  const args = [
      '-i', file.path,
      '-vframes', '1',
      '-an', '-s', '256x144',
      '-ss', '30',
      `${dir}/thumb.jpg`
    ]
  return shellProc(cmd, args);
}

function generatePreviewGif(file: File, dir: string) {
  const cmd = "ffmpeg";

  // prettier-ignore
  const args = [
      '-i', file.path,
      '-ss', '1',
      '-t', '5','-s', '256x144',
      `${dir}/preview.gif`
    ]

  return shellProc(cmd, args);
}

function generateFragments(file: File, dir: string) {
  const cmd = "ffmpeg";

  const resolutionArgs = resolutions.map(r => {
    return `-vf scale=w=${r.w}:h=${r.h}:force_original_aspect_ratio=decrease -c:a aac -ar 48000 -c:v h264 -profile:v main -crf 20 -sc_threshold 0 -g 48 -keyint_min 48 -hls_time 4 -hls_playlist_type vod -b:v ${r.b} -maxrate ${r.maxrate} -bufsize ${r.bufsize} -b:a ${r.ba} -hls_segment_filename ${dir}/${r.h}p_%03d.ts ${dir}/${r.h}p.m3u8`;
  });

  // prettier-ignore
  const args = [
      '-i', file.path,
      ...resolutionArgs,
    ]

  return shellProc(cmd, args);
}

function extractMetadata(file: File, dir: string) {
  const cmd = "ffprobe";

  // prettier-ignore
  const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      file.path, '>', dir + '/' + 'meta.json'
    ]
  return shellProc(cmd, args);
}

function copyOriginal(file: File, dir: string) {
  return new Promise((res, rej) => {
    fs.copyFile(file.path, `${dir}/fallback.mp4`, err => {
      if (err) rej(err);
      res();
    });
  });
}

function shellProc(cmd: string, args: string[]) {
  return new Promise((res, rej) => {
    const spwn = spawn(cmd, args, { shell: true });
    let output = ''
    spwn.stdout.setEncoding('utf8');
    spwn.stdout.on('data', (data) => {
        data=data.toString();
        output+=data;
    });

    spwn.stderr.setEncoding('utf8');
    spwn.stderr.on('data', (data) => {
        data=data.toString();
        output+=data;
    });


    spwn.on("close", code => {
      if (code === 0) {
        res();
      } else {
        rej(new Error('failed on cmd: ' + cmd + ' args: ' + JSON.stringify(args) + ' output: ' + output));
      }
    });
  });
}
