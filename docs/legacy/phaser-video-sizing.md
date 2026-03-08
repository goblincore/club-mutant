# Phaser Video Sizing Issues

## Problem

When using `Phaser.GameObjects.Video` for WebGL video backgrounds, the video doesn't stretch to full width/height on initial load. It only corrects itself after a window resize event.

**Symptoms:**
- Video appears at wrong size (often smaller, centered or offset)
- Resizing the window even slightly fixes the issue
- The `metadata` event fires but sizing is still wrong

## Root Cause

Phaser's `Video.setDisplaySize()` method relies on `video.frame.realWidth` and `video.frame.realHeight` internally. However, the `frame` property is `null` until the video has fully loaded its metadata and created an internal texture frame.

From [Phaser Issue #6475](https://github.com/phaserjs/phaser/issues/6475):
> Video game object does not have frame property, thus it can't get `video.frame.realWidth` for setDisplaySize method

This means calling `setDisplaySize()` before the video is ready throws an error or silently fails.

## Solution

Use `setScale()` instead of `setDisplaySize()`. Calculate the scale manually based on the target dimensions and the video's intrinsic dimensions:

```typescript
private resizeBackgroundSurfaces(width: number, height: number) {
  if (this.backgroundVideo) {
    const video = this.backgroundVideo.video
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      // Video metadata loaded - scale based on intrinsic dimensions
      const scaleX = width / video.videoWidth
      const scaleY = height / video.videoHeight
      this.backgroundVideo.setScale(scaleX, scaleY)
    } else {
      // Fallback: assume 16:9 aspect ratio (1920x1080) until metadata loads
      const scaleX = width / 1920
      const scaleY = height / 1080
      this.backgroundVideo.setScale(scaleX, scaleY)
    }
  }
}
```

### Key Points

1. **Use `setScale()` not `setDisplaySize()`** - `setScale()` works immediately without needing the frame to be loaded

2. **Provide a fallback aspect ratio** - Before metadata loads, assume a common aspect ratio (16:9 = 1920x1080) so the video has reasonable initial sizing

3. **Re-apply sizing on metadata load** - Call the resize function again in the `metadata` event handler to correct the scale once actual dimensions are known

4. **Listen for resize events** - Always update sizing when the game/window resizes:
   ```typescript
   this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize) => {
     this.resizeBackgroundSurfaces(gameSize.width, gameSize.height)
   })
   ```

## Related Issues

- Phaser GitHub Issue #6475: Video game object can't setDisplaySize
- The `metadata` event fires when the browser knows video dimensions, but Phaser's internal frame may not be ready yet
- Cross-origin videos may have additional timing issues due to CORS preflight delays

## CRT Shader Notes (GLSL ES 1.0 Compatibility)

When writing custom shaders for Phaser (WebGL 1), remember these GLSL ES 1.0 limitations:

1. **No integer modulus `%`** - Use `float fmod(float a, float b) { return a - b * floor(a / b); }`

2. **No dynamic array indexing** - Can't do `array[variable]`, must use if/else chains

3. **`mix()` with `lessThan()`** - `lessThan()` returns `bvec3`, but `mix()` needs `float`/`vec3`. Use `step()` instead:
   ```glsl
   // Wrong (GLSL ES 3.0+ only):
   return mix(a, b, lessThan(col, vec3(0.04045)));
   
   // Correct (GLSL ES 1.0):
   vec3 t = step(vec3(0.04045), col);
   return mix(a, b, t);
   ```

4. **Use `uniform float` not `uniform int`** for values that will be used in comparisons or as array indices
