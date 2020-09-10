FROM ubuntu:14.04

RUN apt-get update && apt-get install -y software-properties-common

# Install "ffmpeg"
RUN add-apt-repository ppa:mc3man/trusty-media
RUN apt-get update && apt-get install -y ffmpeg
RUN apt-get update && apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_13.x | sudo -E bash -
RUN apt-get update && apt-get install -y nodejs

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD [ "node", "index.js" ]