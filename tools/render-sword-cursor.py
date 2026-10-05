"""Blender 5.x: blender -b --python tools/render-sword-cursor.py

Gothic inventory-sprite sword: hard studio reflections, worn bronze filigree,
a skull pommel, axial spin and a moving glint. Outputs transparent 64px/320px
sequences and native 48px stills. Package the sequences as APNG with ffmpeg.
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'packages/konpyuuta/src/assets/cursors'
PREVIEWS = ROOT / 'artifacts/liquid-social'
FRAMES = Path('/tmp/club-mutant-gothic-sword')
for directory in [OUTPUT, PREVIEWS, FRAMES / 'cursor', FRAMES / 'review']:
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('black studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.06, .075, .11, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .12

def material(name, color, metal=0, rough=.3, worn=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    if worn:
        noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 55
        bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .22; bump.inputs['Distance'].default_value = .018
        mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
        mat.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat

silver = material('polished silver ridge', (.65, .71, .78), .95, .16, True)
steel = material('tempered steel bevel', (.31, .37, .43), .96, .26, True)
bronze = material('worn gothic bronze', (.38, .19, .055), .88, .24, True)
gold = material('exposed gold edges', (.62, .34, .095), .9, .19)
black = material('recesses and eye sockets', (.008, .006, .009), .15, .38)
leather = material('black oxblood leather', (.04, .008, .016), .05, .48, True)
gem = material('faceted garnet', (.26, .003, .019), .45, .10)
glint_mat = material('white glint', (.9, .97, 1))
glint_mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value = (.9, .97, 1, 1)
glint_mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = 4
root = bpy.data.objects.new('fixed diagonal', None); scene.collection.objects.link(root)
root.rotation_euler[1] = -math.pi / 4
spin = bpy.data.objects.new('axial spin', None); scene.collection.objects.link(spin); spin.parent = root

def finish(obj, mat):
    obj.data.materials.append(mat); obj.parent = spin
    return obj

def sphere(name, location, scale, mat, faceted=False):
    if faceted: bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=location)
    else: bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=location)
    obj = bpy.context.object; obj.name = name; obj.scale = scale
    for face in obj.data.polygons: face.use_smooth = not faceted
    return finish(obj, mat)

def filament(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = radius; curve.bevel_resolution = 3
    spline = curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for point, xyz in zip(spline.bezier_points, points):
        point.co = xyz; point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve); scene.collection.objects.link(obj)
    return finish(obj, mat)

mesh = bpy.data.meshes.new('diamond section blade')
mesh.from_pydata([(-.15,0,-.25),(0,-.10,-.25),(.15,0,-.25),(-.115,0,1.02),(0,-.085,1.02),(.115,0,1.02),(0,0,1.5),(0,.10,-.25),(0,.085,1.02)], [],
    [(0,1,4,3),(1,2,5,4),(3,4,6),(4,5,6),(2,7,8,5),(7,0,3,8),(5,8,6),(8,3,6),(0,7,2,1)])
mesh.update(); blade = bpy.data.objects.new('forged blade',mesh); scene.collection.objects.link(blade); finish(blade,silver)
blade.data.materials.append(steel)
for index in [1,3,5,7]: blade.data.polygons[index].material_index = 1
# The fuller and engraved chevrons stand out against moving steel reflections.
for side in [-1,1]:
    filament('inlaid fuller', [(side*.037,-.079,-.15),(side*.035,-.078,.58),(side*.025,-.077,.96)], .006, black)
    filament('blade engraving', [(side*.11,-.043,-.10),(side*.06,-.070,-.03),(side*.025,-.09,-.10)], .008, bronze)
    filament('swept guard horn', [(0,0,-.32),(side*.24,0,-.26),(side*.39,.015,-.36),(side*.46,.015,-.21),(side*.40,.01,-.15)], .052, bronze)
    filament('guard raised edge', [(side*.07,-.048,-.31),(side*.24,-.052,-.28),(side*.38,-.033,-.37)], .017, gold)
    filament('guard filigree curl', [(side*.11,-.068,-.34),(side*.21,-.065,-.43),(side*.31,-.04,-.41),(side*.30,-.045,-.34),(side*.24,-.053,-.34)], .02, gold)
    sphere('guard thorn', (side*.4,.005,-.16), (.037,.045,.09), gold, True)
sphere('guard collar', (0,0,-.34), (.12,.12,.16), bronze, True)
sphere('guard garnet', (0,-.12,-.34), (.074,.04,.09), gem, True)
sphere('leather grip', (0,.005,-.68), (.078,.09,.28), leather)
for height in [-.44,-.54,-.64,-.74,-.84]:
    filament('raised grip binding', [(-.061,-.045,height+.027),(0,-.093,height),(.061,-.045,height-.027)], .014, bronze)
# Gothic skull pommel with dark recessed sockets and pointed crown.
sphere('pommel skull', (0,0,-1.04), (.17,.13,.18), bronze, True)
for side in [-1,1]:
    sphere('deep eye socket', (side*.063,-.115,-1.035), (.046,.024,.046), black)
    filament('brow ridge', [(side*.025,-.136,-.98),(side*.073,-.132,-.98),(side*.12,-.11,-1.012)], .016, gold)
    filament('pommel crown horn', [(side*.12,.01,-.97),(side*.20,.01,-1.00),(side*.20,0,-1.13)], .027, gold)
sphere('nasal recess', (0,-.133,-1.08), (.026,.018,.035), black, True)
for x in [-.065,-.022,.022,.065]: sphere('pommel teeth', (x,-.085,-1.18), (.018,.04,.035), gold, True)
sphere('crown garnet', (0,-.123,-.935), (.044,.025,.045), gem, True)

# A brief four-point reflective flare travels along the visible blade face.
flare_mesh = bpy.data.meshes.new('glint rays')
flare_mesh.from_pydata([(0,-.112,.13),(.012,-.112,.012),(.085,-.112,0),(.012,-.112,-.012),(0,-.112,-.13),(-.012,-.112,-.012),(-.085,-.112,0),(-.012,-.112,.012)],[],[tuple(range(8))])
flare_mesh.update(); flare=bpy.data.objects.new('passing blade glint',flare_mesh);scene.collection.objects.link(flare); finish(flare,glint_mat)

center = Vector((-.124,0,.124))
bpy.ops.object.camera_add(location=center+Vector((0,-8,0)))
camera=bpy.context.object;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.5;scene.camera=camera
for location,color,power,size in [((-3,-4,5),(1,.92,.74),750,.65),((3,-2,1),(.55,.69,1),260,.45),((1,3,-2),(1,.55,.24),450,1.1)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    lamp=bpy.context.object;lamp.data.color=color;lamp.data.energy=power;lamp.data.size=size;lamp.rotation_euler=(center-lamp.location).to_track_quat('-Z','Y').to_euler()
for frame in range(24):
    phase=math.tau*frame/24
    spin.rotation_euler[2]=phase
    progress=(frame-1)/5
    flare.scale=(1,1,1) if 0<progress<1 else (0,0,0)
    flare.location.z=.22+progress*.92
    if 0<progress<1: flare.scale *= math.sin(progress*math.pi)**2
    for size,folder in [(64,FRAMES/'cursor'),(320,FRAMES/'review')]:
        scene.render.resolution_x=scene.render.resolution_y=size
        scene.render.resolution_percentage=100
        scene.render.filepath=str(folder/f'{frame:03d}.png');bpy.ops.render.render(write_still=True)
    if frame==0:
        for name,glow in [('sword',0),('sword-link',.5)]:
            shader=gem.node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(.3,.002,.025,1);shader.inputs['Emission Strength'].default_value=glow
            scene.render.resolution_x=scene.render.resolution_y=48
            scene.render.filepath=str(OUTPUT/f'{name}.png');bpy.ops.render.render(write_still=True)
        shader.inputs['Emission Strength'].default_value=0
# Selected view with a broad blade and visible hilt for the enlarged still.
spin.rotation_euler[2]=0;flare.scale=(0,0,0)
scene.render.resolution_x=scene.render.resolution_y=320
scene.render.filepath=str(PREVIEWS/'sword.png');bpy.ops.render.render(write_still=True)
scene.render.filepath=str(PREVIEWS/'sword-link.png');bpy.ops.render.render(write_still=True)
