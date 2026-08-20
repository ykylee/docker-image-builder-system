FROM python:3.12-slim
ARG PIP_INDEX_URL
ENV PIP_INDEX_URL=${PIP_INDEX_URL}
RUN python -m pip install --no-cache-dir --disable-pip-version-check pip
