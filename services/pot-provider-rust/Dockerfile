# Use the official prebuilt Node.js image from the bgutil project
# The Rust version has V8 build issues, so we'll use the Node.js version for now
FROM brainicism/bgutil-ytdlp-pot-provider:latest

EXPOSE 4416

CMD ["node", "/app/build/main.js", "--port", "4416"]
