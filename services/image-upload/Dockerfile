# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o image-upload .

# Runtime stage (tiny ~5MB Alpine)
FROM alpine:latest

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/image-upload /image-upload

ENV PORT=4001

EXPOSE 4001

ENTRYPOINT ["/image-upload"]
