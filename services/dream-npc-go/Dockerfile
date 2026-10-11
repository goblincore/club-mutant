FROM golang:1.26.9-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o dream-npc .

FROM alpine:latest
RUN apk --no-cache add ca-certificates

WORKDIR /app/

# Copy the Pre-built binary file from the previous stage
COPY --from=builder /app/dream-npc .

# Data directory for cognitive memory SQLite database
RUN addgroup -g 10001 app && adduser -D -u 10001 -G app app && mkdir -p /app/data && chown -R app:app /app
USER 10001:10001
VOLUME ["/app/data"]

ENV PORT=4000
ENV DUALMEM_DB_PATH=/app/data/dualmem.db
ENV COGMEM_DB_PATH=/app/data/cogmem.db
EXPOSE 4000

# Command to run the executable
CMD ["./dream-npc"]
