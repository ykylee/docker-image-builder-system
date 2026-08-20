FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/artifact-factory-fixture ./cmd/artifact-factory-fixture

FROM alpine:3.20
COPY --from=build /out/artifact-factory-fixture /usr/local/bin/artifact-factory-fixture
EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/artifact-factory-fixture"]
