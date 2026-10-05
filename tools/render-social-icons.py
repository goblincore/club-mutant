"""Blender 5.x: blender -b --python tools/render-social-icons.py -- --frames 24

Transparent 128px sequences and stills; package sequences as WebP with tools/optimize-konpyuuta-assets.py.
All geometry and materials are authored here so assets can be re-rendered.
"""
import argparse
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--frames', type=int, default=24)
parser.add_argument('--kind', choices=['mutanttube', 'messenger', 'mutantmail', 'mutantbook', 'netscape', 'settings', 'filemanager', 'help', 'guides'])
parser.add_argument('--output', default='/tmp/club-mutant-liquid-icons')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

def material(name, color, emission=0):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = .62
    p.inputs['Roughness'].default_value = .17
    p.inputs['Coat Weight'].default_value = .8
    p.inputs['Transmission Weight'].default_value = .18
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return mat

def finish(obj, mat, parent):
    obj.data.materials.append(mat); obj.parent = parent
    if obj.type == 'MESH':
        for face in obj.data.polygons: face.use_smooth = True
    return obj

def bubble(position, scale, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=position)
    obj = bpy.context.object; obj.scale = scale
    return finish(obj, mat, parent)

def slab(position, scale, mat, parent):
    bpy.ops.mesh.primitive_cube_add(size=2, location=position)
    obj=bpy.context.object; obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=obj.modifiers.new('melted corners','BEVEL'); bevel.width=.17; bevel.segments=5
    obj.modifiers.new('soft normals','WEIGHTED_NORMAL')
    return finish(obj,mat,parent)

def tube(points, radius, mat, parent):
    curve = bpy.data.curves.new('liquid filament', 'CURVE'); curve.dimensions = '3D'
    curve.bevel_depth = radius; curve.bevel_resolution = 4; curve.resolution_u = 16
    spline = curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate; point.handle_left_type = 'AUTO'; point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new('filament', curve); bpy.context.collection.objects.link(obj)
    return finish(obj, mat, parent)

for kind in ([args.kind] if args.kind else ['mutanttube', 'messenger', 'mutantmail', 'mutantbook', 'netscape', 'settings', 'filemanager', 'help', 'guides']):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24; scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 128; scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.world = bpy.data.worlds.new('black ether'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.09, .13, .10, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .3
    scene.view_settings.view_transform = 'AgX'
    green = material('acid glass', (.29, .8, .055), .09)
    violet = material('interference', (.31, .1, .63), .04)
    silver = material('wet chrome', (.67, .88, .58), .03)
    light = material('signal light', (.72, 1, .31), 2)
    root = bpy.data.objects.new('rotating signal', None); scene.collection.objects.link(root)

    if kind == 'mutanttube':
        bpy.ops.mesh.primitive_torus_add(major_radius=.7, minor_radius=.25, major_segments=48, minor_segments=16, rotation=(math.pi/2, 0, 0))
        finish(bpy.context.object, green, root)
        mesh=bpy.data.meshes.new('play triangle')
        mesh.from_pydata([(-.25,-.36,-.40),(.43,-.36,0),(-.25,-.36,.40)],[],[(0,1,2)]); mesh.update()
        obj=bpy.data.objects.new('play triangle',mesh); scene.collection.objects.link(obj)
        solid=obj.modifiers.new('depth','SOLIDIFY'); solid.thickness=.09
        bevel=obj.modifiers.new('soft corners','BEVEL'); bevel.width=.025; bevel.segments=3
        finish(obj,light,root)
        bubble((.68, 0, .55), (.2, .24, .31), silver, root)
    elif kind == 'messenger':
        bubble((-.32, 0, .22), (.62, .37, .56), green, root)
        bubble((.38, -.13, -.3), (.57, .33, .48), violet, root)
        tube([(-.57,0,-.06),(-.78,0,-.44),(-.22,0,-.19)],.12,green,root)
        tube([(.50,-.13,-.50),(.74,-.13,-.88),(.25,-.13,-.63)],.10,violet,root)
        tube([(-.66, -.4, .28), (-.38, -.49, .13), (-.05, -.4, .28)], .045, light, root)
        tube([(.13, -.5, -.22), (.43, -.52, -.36), (.67, -.4, -.22)], .045, silver, root)
    elif kind == 'mutantmail':
        slab((0,0,0),(.89,.25,.60),green,root)
        tube([(-.65, -.31, .30), (0, -.37, -.14), (.65, -.31, .30)], .047, light, root)
        bubble((.69, 0, .45), (.23, .2, .25), violet, root)
    elif kind == 'mutantbook':
        slab((-.43,0,0),(.45,.2,.70),green,root)
        slab((.43,0,0),(.45,.2,.70),silver,root)
        tube([(0, -.25, -.67), (0, -.34, 0), (0, -.25, .65)], .065, violet, root)
        for z in [-.24, .02, .28]: tube([(.18, -.27, z), (.42, -.30, z+.04), (.68, -.25, z)], .025, light, root)

    elif kind == 'help':
        bpy.ops.mesh.primitive_torus_add(major_radius=.77, minor_radius=.12, major_segments=48, minor_segments=16, rotation=(math.pi/2,0,0))
        finish(bpy.context.object,green,root)
        tube([(-.29,-.18,.30),(-.19,-.22,.55),(.22,-.24,.54),(.30,-.24,.26),(.02,-.25,.02),(.02,-.25,-.18)],.095,silver,root)
        bubble((.02,-.25,-.48),(.11,.11,.11),light,root)
        bubble((.68,.03,.53),(.19,.19,.19),violet,root)
    elif kind == 'guides':
        for x, angle in [(-.54,-.23),(0,.23),(.54,-.23)]:
            panel=slab((x,0,0),(.29,.10,.65),silver if x==0 else green,root)
            panel.rotation_euler.z=angle
        tube([(-.64,-.17,-.37),(-.36,-.21,-.13),(.05,-.23,-.20),(.33,-.21,.22),(.59,-.17,.35)],.04,violet,root)
        for position in [(-.64,-.17,-.37),(.05,-.23,-.20),(.59,-.17,.35)]:
            bubble(position,(.075,.06,.075),light,root)
        bubble((.66,0,.57),(.20,.16,.20),violet,root)
    elif kind == 'netscape':
        bubble((0,0,0),(.65,.65,.65),silver,root)
        bpy.ops.mesh.primitive_torus_add(major_radius=.88,minor_radius=.075,major_segments=48,minor_segments=12,rotation=(.4,.4,0))
        finish(bpy.context.object,green,root)
        tube([(-.43,-.50,-.1),(-.1,-.64,.22),(.44,-.48,.3)],.045,violet,root)
    elif kind == 'settings':
        bpy.ops.mesh.primitive_torus_add(major_radius=.49,minor_radius=.25,major_segments=48,minor_segments=16,rotation=(math.pi/2,0,0))
        finish(bpy.context.object,green,root)
        for i in range(6):
            a=math.tau*i/6
            bubble((math.sin(a)*.72,0,math.cos(a)*.72),(.21,.28,.22),silver,root)
    elif kind == 'filemanager':
        slab((0,.14,.05),(.9,.15,.62),green,root)
        slab((-.46,.14,.60),(.36,.15,.19),green,root)
        slab((0,-.15,-.08),(.91,.16,.51),silver,root)

    bpy.ops.object.camera_add(location=(0, -5.5, 2.1))
    camera = bpy.context.object; camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 2.7; scene.camera = camera
    for position, color, energy, size in [((-3,-4,5),(0.77,1,.51),650,4),((3,1,3),(.58,.28,1),850,3),((1,-3,-2),(.63,1,.29),260,2)]:
        bpy.ops.object.light_add(type='AREA', location=position)
        lamp=bpy.context.object; lamp.data.energy=energy; lamp.data.color=color; lamp.data.shape='DISK'; lamp.data.size=size
        lamp.rotation_euler=(-lamp.location).to_track_quat('-Z','Y').to_euler()
    folder=Path(args.output)/kind; folder.mkdir(parents=True,exist_ok=True)
    for frame in range(args.frames):
        phase=math.tau*frame/max(24,args.frames)
        root.rotation_euler=(.10*math.sin(phase), 0, phase)
        scene.render.filepath=str(folder/f'{frame:03d}.png')
        bpy.ops.render.render(write_still=True)
    print('Rendered', kind, args.frames, 'frames')
