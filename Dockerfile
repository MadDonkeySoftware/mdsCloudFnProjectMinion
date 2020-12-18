FROM ubuntu:focal

# Setup
WORKDIR /root
COPY docker/* ./

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get -y install \
        curl \
        wget \
        apt-transport-https \
        ca-certificates \
        gnupg-agent \
        software-properties-common \
        nodejs \
        npm \
        && \
    curl -sSL https://get.docker.com/ | sh && \
    chmod +x entry.sh

# Cleanup
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=prod
COPY . .
RUN chmod 777 -R /tmp && chmod o+t -R /tmp
ENTRYPOINT [ "/root/entry.sh" ]
CMD [ "node", "./bin/minion" ]