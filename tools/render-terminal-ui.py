"""Small prerendered parts for the CRT terminal HUD.

blender -b --python tools/render-terminal-ui.py -- --output /tmp/club-mutant-terminal-ui
python3 tools/render-terminal-ui.py --package-from /tmp/club-mutant-terminal-ui

The second command needs Pillow. No Blender API is imported in packaging mode.
The 24-frame turntables run at 6fps; still PNGs serve reduced-motion users.
"""

import argparse
import math
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
ANIMATED = {"flower", "playlist", "settings", "chat", "audio", "audio-muted", "exit", "video", "share"}
KINDS = ["flower", "playlist", "settings", "chat", "audio", "audio-muted", "exit", "video", "share", "beetle", "frame", "wires"]


def package(source):
    from PIL import Image

    target = ROOT / "client-3d/public/ui/terminal"
    target.mkdir(parents=True, exist_ok=True)
    for kind in KINDS:
        if kind not in ANIMATED:
            shutil.copy2(source / (kind + ".png"), target / (kind + ".png"))
            continue
        frames = [Image.open(path).convert("RGBA") for path in sorted((source / kind).glob("[0-9][0-9][0-9].png"))]
        if len(frames) != 24:
            raise ValueError(f"{kind}: expected 24 frames, got {len(frames)}")
        frames[0].save(target / (kind + ".png"), optimize=True)
        # Round cumulative milliseconds so the loop is exactly four seconds.
        ticks = [round((i + 1) * 1000 / 6) - round(i * 1000 / 6) for i in range(24)]
        path = target / (kind + ".webp")
        frames[0].save(path, format="WEBP", save_all=True, append_images=frames[1:],
                       duration=ticks, loop=0, quality=86, method=6)
        with Image.open(path) as image:
            if image.n_frames != 24 or image.size != (64, 64) or image.info.get("loop") != 0:
                raise ValueError(f"Invalid animation: {path}")
    print(f"Packaged terminal parts: {target}")


def render(output, only=None):
    import bpy
    from mathutils import Vector

    def material(name, color, metallic=0.45, roughness=0.48, worn=False):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*color, 1)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if worn:
            noise = mat.node_tree.nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = 28
            bump = mat.node_tree.nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value = 0.18
            bump.inputs["Distance"].default_value = 0.025
            mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
            mat.node_tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
        return mat

    def finish(obj, mat, root):
        obj.data.materials.append(mat)
        obj.parent = root
        if obj.type == "MESH":
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        return obj

    def ball(position, scale, mat, root):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=position)
        obj = bpy.context.object
        obj.scale = scale
        return finish(obj, mat, root)

    def box(position, scale, mat, root, bevel=0.04):
        bpy.ops.mesh.primitive_cube_add(size=2, location=position)
        obj = bpy.context.object
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        modifier = obj.modifiers.new("cast edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
        return finish(obj, mat, root)

    def tube(points, radius, mat, root):
        curve = bpy.data.curves.new("insulated wire", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = radius
        curve.bevel_resolution = 3
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(len(points) - 1)
        for point, coordinate in zip(spline.bezier_points, points):
            point.co = coordinate
            point.handle_left_type = point.handle_right_type = "AUTO"
        obj = bpy.data.objects.new("wire", curve)
        bpy.context.collection.objects.link(obj)
        return finish(obj, mat, root)

    def ring(position, radius, thickness, mat, root):
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness,
                                        major_segments=32, minor_segments=8,
                                        location=position, rotation=(math.pi / 2, 0, 0))
        return finish(bpy.context.object, mat, root)

    def silhouette(points, mat, root):
        """A familiar speaker silhouette with real depth and a cast bevel."""
        vertices = [(x, y, z) for y in [-0.13, 0.13] for x, z in points]
        n = len(points)
        faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
        faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
        mesh = bpy.data.meshes.new('speaker casting')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new('speaker casting', mesh)
        bpy.context.collection.objects.link(obj)
        bevel = obj.modifiers.new('cast bevel', 'BEVEL')
        bevel.width = 0.055
        bevel.segments = 3
        obj.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
        return finish(obj, mat, root)

    for kind in ([only] if only else KINDS):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 24
        scene.cycles.use_denoising = True
        size = 96 if kind == "frame" else 64
        scene.render.resolution_x = scene.render.resolution_y = size
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.world = bpy.data.worlds.new("warm terminal room")
        scene.world.use_nodes = True
        scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.17, 0.13, 1)
        scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
        scene.view_settings.view_transform = "AgX"
        root = bpy.data.objects.new("terminal part", None)
        scene.collection.objects.link(root)
        metal = material("worn pewter", (0.30, 0.30, 0.23), roughness=0.40, worn=True)
        dark = material("charcoal plastic", (0.055, 0.06, 0.045), 0.12, 0.65)
        silver = material("dull silver", (0.62, 0.63, 0.50), 0.65, 0.34)
        green = material("olive enamel", (0.30, 0.49, 0.065), 0.35, 0.28)
        red = material("muted red insulation", (0.32, 0.055, 0.035), 0.05, 0.58)
        blue = material("dusty blue insulation", (0.045, 0.13, 0.20), 0.05, 0.58)
        amber = material("amber enamel", (0.63, 0.48, 0.06), 0.2, 0.42)
        moving = []

        if kind == "flower":
            for i in range(8):
                theta = i * math.tau / 8
                petal = ball((math.sin(theta) * 0.50, 0, math.cos(theta) * 0.50),
                             (0.20, 0.14, 0.38), red if i == 5 else green, root)
                petal.rotation_euler.y = theta
            ball((0, -0.14, 0), (0.24, 0.15, 0.24), amber, root)
            for x in [-0.075, 0.075]:
                ball((x, -0.282, 0.04), (0.022, 0.018, 0.026), dark, root)
            tube([(-0.10, -0.28, -0.045), (0, -0.30, -0.11), (0.10, -0.28, -0.045)], 0.017, dark, root)
        elif kind == "playlist":
            box((-0.13, 0.17, 0.12), (0.57, 0.07, 0.70), silver, root)
            box((-0.06, 0.08, 0.06), (0.57, 0.07, 0.70), blue, root)
            box((0, 0, 0), (0.57, 0.09, 0.70), metal, root)
            for z in [0.35, 0.02, -0.31]:
                tube([(-0.41, -0.13, z), (-0.09, -0.13, z)], 0.035, silver, root)
                ball((-0.48, -0.14, z), (0.035, 0.02, 0.035), green, root)
            tube([(0.17, -0.19, -0.31), (0.17, -0.19, 0.39), (0.51, -0.19, 0.50), (0.51, -0.19, -0.16)], 0.060, silver, root)
            ball((0.07, -0.19, -0.36), (0.17, 0.07, 0.12), green, root)
            ball((0.41, -0.19, -0.21), (0.17, 0.07, 0.12), green, root)
        elif kind == "settings":
            ring((0, 0, 0), 0.47, 0.17, metal, root)
            for i in range(10):
                theta = i * math.tau / 10
                tooth = box((math.sin(theta) * 0.65, 0, math.cos(theta) * 0.65),
                            (0.11, 0.13, 0.19), silver, root)
                tooth.rotation_euler.y = theta
            ring((0, -0.12, 0), 0.26, 0.06, dark, root)
        elif kind == "chat":
            box((0, 0, 0.10), (0.68, 0.14, 0.46), metal, root, 0.09)
            tube([(-0.4, 0, -0.15), (-0.58, 0, -0.62), (-0.02, 0, -0.25)], 0.11, metal, root)
            for x in [-0.30, 0, 0.30]:
                moving.append(ball((x, -0.17, 0.11), (0.065, 0.035, 0.065), green, root))
        elif kind in {"audio", "audio-muted"}:
            silhouette([(-0.85, -0.22), (-0.55, -0.22), (-0.12, -0.62),
                        (-0.12, 0.62), (-0.55, 0.22), (-0.85, 0.22)], silver, root)
            box((-0.63, -0.16, 0), (0.08, 0.025, 0.16), metal, root)
            if kind == "audio":
                for x, height in [(0.10, 0.25), (0.34, 0.47), (0.57, 0.67)]:
                    moving.append(tube([(x, -0.10, height), (x + 0.15, -0.10, 0), (x, -0.10, -height)], 0.055, silver, root))
            else:
                moving.append(tube([(0.12, -0.20, 0.36), (0.74, -0.20, -0.36)], 0.078, red, root))
                moving.append(tube([(0.12, -0.20, -0.36), (0.74, -0.20, 0.36)], 0.078, red, root))
        elif kind == "exit":
            for x in [-0.48, 0.48]:
                box((x, 0, 0), (0.075, 0.12, 0.69), metal, root)
            box((0, 0, 0.64), (0.51, 0.12, 0.07), metal, root)
            box((0, 0, -0.64), (0.51, 0.12, 0.07), metal, root)
            moving.append(tube([(-0.30, -0.20, 0), (0.58, -0.20, 0)], 0.07, silver, root))
            moving.append(tube([(0.23, -0.20, 0.30), (0.58, -0.20, 0), (0.23, -0.20, -0.30)], 0.07, silver, root))
        elif kind == "video":
            box((0, 0, 0.12), (0.69, 0.26, 0.50), metal, root, 0.09)
            box((-0.06, -0.28, 0.14), (0.49, 0.04, 0.33), green, root, 0.07)
            box((0, 0, -0.54), (0.16, 0.12, 0.15), metal, root)
            box((0, 0, -0.65), (0.40, 0.22, 0.05), metal, root)
            moving.append(box((-0.06, -0.33, 0.14), (0.43, 0.008, 0.023), silver, root, 0.01))
        elif kind == "share":
            points = [(-0.5, 0, 0), (0.45, 0, 0.5), (0.45, 0, -0.5)]
            tube([points[1], points[0], points[2]], 0.07, silver, root)
            for point in points:
                moving.append(ball(point, (0.22, 0.16, 0.22), green, root))
        elif kind == "beetle":
            ball((0, 0, 0), (0.35, 0.20, 0.52), metal, root)
            ball((0, 0, 0.53), (0.20, 0.17, 0.19), dark, root)
            tube([(0, -0.20, -0.4), (0, -0.22, 0.4)], 0.018, silver, root)
            for side in [-1, 1]:
                for z in [-0.3, 0, 0.3]:
                    tube([(side * 0.20, 0, z), (side * 0.52, 0, z + 0.16), (side * 0.62, 0, z - 0.12)], 0.025, dark, root)
        elif kind == "frame":
            # A transparent center and broad corner cells for CSS nine-slicing.
            for x in [-1.31, 1.31]:
                box((x, 0, 0), (0.19, 0.12, 1.5), metal, root, 0.05)
            for z in [-1.31, 1.31]:
                box((0, 0, z), (1.5, 0.12, 0.19), metal, root, 0.05)
            for x in [-1.28, 1.28]:
                for z in [-1.28, 1.28]:
                    ball((x, -0.14, z), (0.085, 0.045, 0.085), silver, root)
                    box((x, -0.188, z), (0.049, 0.007, 0.010), dark, root, 0.003)
        elif kind == "wires":
            for offset, mat in [(-0.12, blue), (0.12, red)]:
                tube([(-0.70, 0, 0.70 + offset), (-0.94, 0, 0.63 + offset),
                      (-1.02 + offset, 0, 0), (-0.94, 0, -0.63 + offset),
                      (-0.70, 0, -0.70 + offset)], 0.043, mat, root)
                for z in [0.70 + offset, -0.70 + offset]:
                    ball((-0.70, 0, z), (0.08, 0.07, 0.065), metal, root)

        bpy.ops.object.camera_add(location=(0, -7, 0))
        camera = bpy.context.object
        camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 3.25 if kind == "frame" else 2.2
        scene.camera = camera
        for location, energy, area in [((-3, -4, 5), 330, 4), ((3, -2, 1), 70, 3)]:
            bpy.ops.object.light_add(type="AREA", location=location)
            light = bpy.context.object
            light.data.energy = energy
            light.data.shape = "DISK"
            light.data.size = area
            light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()

        folder = output / kind if kind in ANIMATED else output
        folder.mkdir(parents=True, exist_ok=True)
        for index in range(24 if kind in ANIMATED else 1):
            phase = index * math.tau / 24
            root.rotation_euler.y = phase if kind == "settings" else 0
            root.rotation_euler.x = 0.10 if kind in ANIMATED else 0
            root.rotation_euler.z = phase if kind == "flower" else 0
            root.location.z = 0
            if kind in {"playlist", "chat", "video", "share"}:
                # Keep these silhouettes legible throughout the loop.
                root.rotation_euler.z = 0.08 * math.sin(phase)
                root.location.z = 0.025 * math.sin(phase)
            for i, part in enumerate(moving):
                if kind == "chat":
                    part.scale = (0.065, 0.035, 0.065)
                    part.scale *= 0.85 + 0.3 * math.sin(phase - i * 1.5)
                elif kind == "share":
                    part.scale = (0.22, 0.16, 0.22)
                    part.scale *= 1 + 0.12 * math.sin(phase - i * 1.5)
                elif kind in {"audio", "audio-muted"}:
                    part.scale = (1, 1, 0.93 + 0.07 * math.sin(phase - i))
                    part.location.x = 0.035 * math.sin(phase - i)
                elif kind == "exit":
                    part.location.x = 0.10 + 0.10 * math.sin(phase)
                elif kind == "video":
                    part.location.z = 0.27 * math.sin(phase)
            scene.render.filepath = str(folder / (f"{index:03d}.png" if kind in ANIMATED else kind + ".png"))
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/club-mutant-terminal-ui"))
    parser.add_argument("--package-from", type=Path)
    parser.add_argument("--kind", choices=KINDS)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    if args.package_from:
        package(args.package_from)
    else:
        render(args.output, args.kind)
