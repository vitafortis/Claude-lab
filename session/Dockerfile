# syntax=docker/dockerfile:1
# The image every cc·modern session runs in: Claude Code inside tmux, with git, gh and
# the usual tools. One image is shared by all sessions; their repos, homes and Claude
# config live in the sessions volume, so containers are disposable.
FROM node:24-trixie-slim

# npm dist-tag or exact version, e.g. stable, latest, 2.1.310.
ARG CLAUDE_CODE_VERSION=stable

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates curl git gh tmux ripgrep jq less procps openssh-client \
		python3 python3-venv make g++ unzip xz-utils tini locales \
	&& rm -rf /var/lib/apt/lists/*

# The npm package ships the same native binary as the standalone installer. Updates come
# with a new image (sessions keep running the version they started with).
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
	&& npm cache clean --force \
	&& claude --version

COPY tmux.conf /etc/tmux.conf
COPY gitconfig /etc/gitconfig
COPY --chmod=755 bin/ /usr/local/bin/
COPY lib/ /usr/local/lib/ccm/

RUN mkdir -p /workspace /claude && chown node:node /workspace /claude

ENV LANG=C.UTF-8 \
	TERM=xterm-256color \
	COLORTERM=truecolor \
	SHELL=/bin/bash \
	DISABLE_AUTOUPDATER=1 \
	CLAUDE_CONFIG_DIR=/claude

LABEL org.opencontainers.image.source=https://github.com/vitafortis/Claude-lab
USER node
WORKDIR /workspace
ENTRYPOINT ["tini", "--", "/usr/local/bin/ccm-entrypoint"]
