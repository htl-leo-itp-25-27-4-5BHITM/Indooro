"""Extract Blender Studio's CC0 realistic hand base mesh into a small local asset.

Download the Human Base Meshes v1.2.0 bundle from Blender's demo-files page,
unzip its .blend into assets/character-source/, then run with Blender --python.
The committed extracted .blend avoids a runtime download.
"""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "assets/character-source/human_base_meshes_bundle.blend"
DEST = ROOT / "assets/character/hand-realistic.blend"
DEST.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
with bpy.data.libraries.load(str(SOURCE), link=False) as (available, loaded):
    assert "Hand  - Realistic" in available.objects
    loaded.objects = ["Hand  - Realistic"]

original = loaded.objects[0]
bpy.context.collection.objects.link(original)
bpy.context.view_layer.update()
wrist = Vector((1.4235, .013, .4316))
vertices = [original.matrix_world @ v.co - wrist for v in original.data.vertices]
faces = [tuple(poly.vertices) for poly in original.data.polygons]
mesh = bpy.data.meshes.new("Blender Studio CC0 realistic hand")
mesh.from_pydata(vertices, [], faces)
mesh.update()
ob = bpy.data.objects.new("Indooro shopper hand base", mesh)
bpy.context.collection.objects.link(ob)
bpy.data.objects.remove(original, do_unlink=True)
for poly in mesh.polygons:
    poly.use_smooth = True
bpy.ops.wm.save_as_mainfile(filepath=str(DEST))
print(f"Saved {len(vertices)} vertices to {DEST}")
