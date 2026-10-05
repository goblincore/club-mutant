"""Blender 5.x: blender -b --python tools/render-sword-cursor.py

Author a small silver/gold sword for the liquid desktop. Transparent 40px
native cursors share the blade-tip hotspot (5, 5); 320px renders aid review.
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'packages/konpyuuta/src/assets/cursors'
PREVIEWS = ROOT / 'artifacts/liquid-social'
OUTPUT.mkdir(parents=True, exist_ok=True)
PREVIEWS.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('soft studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.22, .26, .34, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65

def material(name, color, metal=0, rough=.3):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    return mat

silver = material('silver light facet', (.82, .89, 1), .72, .22)
steel = material('blue steel shadow facet', (.26, .38, .54), .65, .27)
gold = material('old gold crossguard', (.56, .32, .075), .72, .27)
leather = material('violet leather', (.095, .025, .11), .12, .4)
gem = material('garnet pommel', (.38, .025, .065), .35, .18)
root = bpy.data.objects.new('sword', None)
scene.collection.objects.link(root)
root.rotation_euler[1] = -math.pi / 4

def finish(obj, mat):
    obj.data.materials.append(mat)
    obj.parent = root
    return obj

def sphere(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    for face in obj.data.polygons:
        face.use_smooth = True
    return finish(obj, mat)

def filament(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, xyz in zip(spline.bezier_points, points):
        point.co = xyz
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    return finish(obj, mat)

# A diamond cross-section gives the blade distinct lit and shadowed faces.
mesh = bpy.data.meshes.new('faceted blade')
mesh.from_pydata([
    (-.15, 0, -.25), (0, -.075, -.25), (.15, 0, -.25),
    (-.115, 0, 1.02), (0, -.065, 1.02), (.115, 0, 1.02),
    (0, 0, 1.5), (0, .06, -.25), (0, .045, 1.02),
], [], [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6),
        (2, 7, 8, 5), (7, 0, 3, 8), (5, 8, 6), (8, 3, 6), (0, 7, 2, 1)])
mesh.update()
blade = bpy.data.objects.new('silver blade', mesh)
scene.collection.objects.link(blade)
finish(blade, silver)
blade.data.materials.append(steel)
for index in [1, 3, 4, 6]:
    blade.data.polygons[index].material_index = 1

filament('curved crossguard', [(-.39, 0, -.37), (-.28, 0, -.28), (0, 0, -.3), (.28, 0, -.28), (.39, 0, -.37)], .065, gold)
sphere('grip', (0, .005, -.65), (.075, .085, .32), leather)
for height in [-.42, -.56, -.70, -.84]:
    filament('grip binding', [(-.063, -.045, height+.035), (0, -.09, height), (.063, -.045, height-.035)], .017, gold)
sphere('pommel', (0, 0, -1.06), (.135, .10, .14), gold)
sphere('pommel stone', (0, -.099, -1.06), (.071, .027, .076), gem)

center = Vector((-.124, 0, .124))
bpy.ops.object.camera_add(location=center + Vector((0, -8, 0)))
camera = bpy.context.object
camera.rotation_euler = (center-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.5
scene.camera = camera
for location, color, power, size in [((-3, -4, 5), (1, .95, .8), 600, 4), ((3, -3, 1), (.7, .8, 1), 450, 3), ((0, 2, -2), (.7, .4, 1), 300, 3)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    lamp = bpy.context.object
    lamp.data.color = color
    lamp.data.energy = power
    lamp.data.size = size
    lamp.rotation_euler = (center-lamp.location).to_track_quat('-Z', 'Y').to_euler()

for name, glow in [('sword', 0), ('sword-link', .45)]:
    shader = gem.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = (.5, .035, .12, 1)
    shader.inputs['Emission Strength'].default_value = glow
    for size, folder in [(40, OUTPUT), (320, PREVIEWS)]:
        scene.render.resolution_x = scene.render.resolution_y = size
        scene.render.resolution_percentage = 100
        scene.render.filepath = str(folder / f'{name}.png')
        bpy.ops.render.render(write_still=True)
