"""Rejected-rough-cut replacement look development, isolated from the edit.
Usage: blender -b --factory-startup --python render_lookdev.py -- P1|P3|P4|P5|P6|P7 [still_frame|start:end]
Output: public/3d-passes/LOOKDEV-<kind>/... (ignored by Git)
Only selected frames have been reviewed; this is not a replacement film.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
LAYOUT = json.loads((ROOT / "src/data/store-layout.json").read_text())
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
KIND = ARGS[0] if ARGS else "P1"
FRAME_SELECTION = ARGS[1] if len(ARGS) > 1 else None
STILL = int(FRAME_SELECTION) if FRAME_SELECTION and ":" not in FRAME_SELECTION else None
RANGE = tuple(map(int, FRAME_SELECTION.split(":"))) if FRAME_SELECTION and ":" in FRAME_SELECTION else None
FRAME_COUNTS = {"P1": 120, "P3": 120, "P4": 120, "P5": 75, "P6": 75, "P7": 90}
if KIND not in FRAME_COUNTS:
    raise ValueError("Expected one of " + ", ".join(FRAME_COUNTS))
FRAME_COUNT = FRAME_COUNTS[KIND]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.film_transparent = False
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, FRAME_COUNT
scene.render.filepath = str(ROOT / "public/3d-passes" / ("LOOKDEV-"+KIND) / "frame_")
scene.render.image_settings.color_depth = "8"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.film_transparent = False
try:
    scene.eevee.taa_render_samples = 24
except AttributeError:
    pass
scene.world.color = (0.012, 0.02, 0.025)
outdir = ROOT / "public/3d-passes" / ("LOOKDEV-"+KIND)
outdir.mkdir(parents=True, exist_ok=True)

def material(name, color, rough=.65, metallic=0, emission=None, strength=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metallic
    if emission is not None:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = strength
    return mat

def micro_surface(mat, scale, bump_strength, bump_distance, rough_min, rough_max,
                  color_min=None, color_max=None):
    """Subtle deterministic procedural surface; no sampled bitmap assets."""
    nodes=mat.node_tree.nodes; links=mat.node_tree.links
    bsdf=nodes.get("Principled BSDF")
    tex=nodes.new("ShaderNodeTexNoise");tex.inputs["Scale"].default_value=scale
    tex.inputs["Detail"].default_value=3
    tex.inputs["Roughness"].default_value=.62
    bump=nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value=bump_strength
    bump.inputs["Distance"].default_value=bump_distance
    links.new(tex.outputs["Fac"],bump.inputs["Height"])
    links.new(bump.outputs["Normal"],bsdf.inputs["Normal"])
    rough=nodes.new("ShaderNodeMapRange")
    rough.inputs["From Min"].default_value=0
    rough.inputs["From Max"].default_value=1
    rough.inputs["To Min"].default_value=rough_min
    rough.inputs["To Max"].default_value=rough_max
    links.new(tex.outputs["Fac"],rough.inputs["Value"])
    links.new(rough.outputs["Result"],bsdf.inputs["Roughness"])
    if color_min is not None and color_max is not None:
        ramp=nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color=(*color_min,1)
        ramp.color_ramp.elements[1].color=(*color_max,1)
        links.new(tex.outputs["Fac"],ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"],bsdf.inputs["Base Color"])

FLOOR = material("graphite floor", (.022,.037,.047), .78, .16)
SHELF = material("matte shelf graphite", (.045,.073,.081), .7, .2)
SHELF_FACE = material("brushed shelf edge", (.086,.13,.14), .55, .35)
PRODUCT = material("abstract product backs", (.09,.14,.15), .8, .02)
STOCK_A = material("muted paper packages", (.21,.28,.27), .8, .01)
STOCK_B = material("graphite packaged goods", (.11,.17,.18), .75, .04)
STOCK_C = material("warm neutral packages", (.29,.29,.25), .82, .01)
MINT = material("Indooro mint route", (.05,.55,.36), .3, .06, (.04,.57,.36), .75)
SOFT_MINT = material("soft mint", (.11,.28,.25), .65, .05, (.14,.65,.48), .4)
AMBER = material("uncertainty amber", (.64,.39,.16), .7, 0, (.55,.28,.08), .4)
COAT = material("woven graphite coat", (.06,.072,.077), .87, .01)
COAT_EDGE = material("dark coat binding", (.035,.046,.05), .91, .0)
COAT_THREAD = material("fine coat seam", (.13,.15,.15), .83, .0)
HEAD = material("warm sculptural skin", (.30,.24,.20), .68, 0)
HAND_SKIN = material("shopper hand skin", (.34,.26,.21), .55, 0)
HAND_SKIN.node_tree.nodes.get("Principled BSDF").inputs["Subsurface Weight"].default_value=.06
MILK = material("uncoated milk carton paper", (.78,.81,.76), .62, 0)
MILK_TOP = material("carton folded top", (.65,.70,.67), .7, 0)
INK = material("milk carton printed ink", (.025,.19,.16), .72, 0)
micro_surface(FLOOR,115,.025,.004,.72,.84)
micro_surface(SHELF,90,.025,.003,.54,.71,(.038,.066,.073),(.052,.079,.086))
micro_surface(SHELF_FACE,160,.02,.003,.42,.59)
micro_surface(COAT,75,.055,.005,.76,.94,(.048,.058,.063),(.074,.083,.087))
micro_surface(COAT_EDGE,75,.04,.004,.82,.96)
micro_surface(HEAD,75,.02,.003,.76,.9)
micro_surface(MILK,105,.03,.002,.54,.7,(.73,.77,.73),(.84,.86,.81))

def pbr_maps(mat, asset, scale, tint=None):
    """Use licensed image-based color/roughness/normal maps at world-aware repeat."""
    base=ROOT/"assets/pbr"
    nodes=mat.node_tree.nodes;links=mat.node_tree.links
    bsdf=nodes.get("Principled BSDF")
    coordinates=nodes.new("ShaderNodeTexCoord")
    tile=nodes.new("ShaderNodeVectorMath");tile.operation="MULTIPLY"
    tile.inputs[1].default_value=scale
    links.new(coordinates.outputs["Generated"],tile.inputs[0])
    def image_map(suffix, non_color=False):
        node=nodes.new("ShaderNodeTexImage")
        node.image=bpy.data.images.load(str(base/f"{asset}_{suffix}.jpg"),check_existing=True)
        if non_color:node.image.colorspace_settings.name="Non-Color"
        links.new(tile.outputs["Vector"],node.inputs["Vector"])
        return node
    color=image_map("Diffuse")
    if tint is None:links.new(color.outputs["Color"],bsdf.inputs["Base Color"])
    else:
        multiply=nodes.new("ShaderNodeMixRGB");multiply.blend_type="MULTIPLY"
        multiply.inputs[0].default_value=1
        multiply.inputs[2].default_value=(*tint,1)
        links.new(color.outputs["Color"],multiply.inputs[1])
        links.new(multiply.outputs["Color"],bsdf.inputs["Base Color"])
    rough=image_map("Rough",True)
    links.new(rough.outputs["Color"],bsdf.inputs["Roughness"])
    normal=image_map("nor_gl",True)
    mapnode=nodes.new("ShaderNodeNormalMap");mapnode.inputs["Strength"].default_value=.38
    links.new(normal.outputs["Color"],mapnode.inputs["Color"])
    links.new(mapnode.outputs["Normal"],bsdf.inputs["Normal"])

pbr_maps(FLOOR,"interior_tiles",(8,11,1),(.39,.47,.46))
pbr_maps(COAT,"denim_fabric_03",(4,4,2),(.16,.21,.20))

LABEL_NAMES=("milch","hafer","pasta","saft","reis","kaffee","tee","kakao")
PACKAGE_BODIES=[material(f"printed pack {i} sides",c,.7) for i,c in enumerate((
    (.72,.72,.67),(.65,.51,.35),(.68,.49,.28),(.49,.60,.50),
    (.66,.64,.57),(.36,.30,.26),(.46,.58,.43),(.42,.30,.26)))]
PACKAGE_FRONTS=[]
for name in LABEL_NAMES:
    mat=material(f"original {name} printed artwork",(.7,.7,.7),.61)
    tex=mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image=bpy.data.images.load(str(ROOT/"assets/product-labels"/f"{name}.png"),check_existing=True)
    mat.node_tree.links.new(tex.outputs["Color"],mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    PACKAGE_FRONTS.append(mat)

# Real scanned package forms break up the repeated cartons. The Poly Haven
# glTF supplies original geometry and image-based materials; a small set is
# instanced into the procedural racks rather than replacing the store layout.
before_food=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/"assets/models/long_life_food/long_life_food_1k.gltf"))
food_sources={}
for ob in set(bpy.data.objects)-before_food:
    if ob.type=="MESH" and ob.name in {"long_life_food_beans","long_life_food_tomatoes"}:
        food_sources[ob.name]=ob.data
    bpy.data.objects.remove(ob,do_unlink=True)

def scanned_can(name, loc, variant):
    mesh=food_sources["long_life_food_"+variant]
    ob=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(ob)
    ob.location=loc
    ob.scale=(1.85,1.85,1.85)
    return ob

def box(name, loc, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new("soft bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        ob.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return ob

def product_box(name, loc, size, side, product_index):
    """One real volume with an individually printed front instead of a stock cuboid."""
    x,y,z=loc;depth,width,height=size
    x0,x1=x-depth/2,x+depth/2;y0,y1=y-width/2,y+width/2;z0,z1=z-height/2,z+height/2
    vertices=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),
              (x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
    mesh=bpy.data.meshes.new(name+" geometry");mesh.from_pydata(vertices,[],faces);mesh.update()
    mesh.materials.append(PACKAGE_BODIES[product_index]);mesh.materials.append(PACKAGE_FRONTS[product_index])
    front=5 if side>0 else 4
    mesh.polygons[front].material_index=1
    uv=mesh.uv_layers.new(name="Front artwork")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vertex=vertices[mesh.loops[loop_index].vertex_index]
            u=(vertex[1]-y0)/(y1-y0)
            if side<0:u=1-u
            v=(vertex[2]-z0)/(z1-z0)
            uv.data[loop_index].uv=(u,v)
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    bevel=ob.modifiers.new("folded carton edges","BEVEL");bevel.width=.008;bevel.segments=1
    ob.modifiers.new("carton normals","WEIGHTED_NORMAL")
    return ob

def realistic_hand():
    """Append the CC0 Blender Studio mesh; wrist is its local origin."""
    source=ROOT/"assets/character/hand-realistic.blend"
    with bpy.data.libraries.load(str(source),link=False) as (available,loaded):
        loaded.objects=["Indooro shopper hand base"]
    ob=loaded.objects[0]
    bpy.context.collection.objects.link(ob)
    ob.name="shopper reaching hand (Blender Studio CC0 base)"
    ob.data.materials.clear();ob.data.materials.append(HAND_SKIN)
    # Local -Z points to fingertips. Spread fingers vertically for a side grip.
    ob.rotation_euler=Matrix(((0,0,1),(0,1,0),(-1,0,0))).to_euler()
    subdiv=ob.modifiers.new("soft hand anatomy","SUBSURF")
    subdiv.levels=1;subdiv.render_levels=1
    return ob

def sphere(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=loc)
    ob=bpy.context.object; ob.name=name
    ob.scale=scale
    ob.data.materials.append(mat)
    for poly in ob.data.polygons: poly.use_smooth=True
    return ob

def tapered(name, loc, radius_lower, radius_upper, depth, mat, bevel=.025):
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=radius_lower, radius2=radius_upper, depth=depth, location=loc)
    ob=bpy.context.object;ob.name=name;ob.data.materials.append(mat)
    mod=ob.modifiers.new("soft clothing edge","BEVEL");mod.width=bevel;mod.segments=2
    ob.modifiers.new("weighted normals","WEIGHTED_NORMAL")
    return ob

def pose_segment(ob, a, b, frame):
    """Key one tapered arm section while keeping its endpoints attached."""
    va,vb=Vector(a),Vector(b);direction=vb-va
    ob.location=(va+vb)*.5
    ob.rotation_euler=direction.to_track_quat("Z","Y").to_euler()
    ob.scale.z=direction.length
    for prop in ("location","rotation_euler","scale"):
        ob.keyframe_insert(data_path=prop,frame=frame)

def grow_with_store(ob):
    if KIND!="P3": return
    ob.scale=(.01,.01,.01)
    ob.keyframe_insert(data_path="scale",frame=1)
    ob.keyframe_insert(data_path="scale",frame=42)
    ob.scale=(1,1,1)
    ob.keyframe_insert(data_path="scale",frame=83)

def curve_line(name, coords, radius, mat):
    curve=bpy.data.curves.new(name,"CURVE"); curve.dimensions="3D"; curve.resolution_u=12
    curve.bevel_depth=radius; curve.bevel_resolution=3
    spline=curve.splines.new("POLY"); spline.points.add(len(coords)-1)
    for p,co in zip(spline.points,coords): p.co=(*co,1)
    ob=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob

def area(name, loc, energy, color, size, target):
    data=bpy.data.lights.new(name,"AREA"); data.energy=energy; data.color=color; data.shape="DISK"; data.size=size
    ob=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(ob); ob.location=loc
    direction=Vector(target)-ob.location; ob.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
    return ob

def look(cam, target):
    direction=Vector(target)-cam.location
    cam.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()

def cam_key(cam, frame, loc, target, lens=35):
    cam.location=loc; look(cam,target); cam.data.lens=lens
    # The same physical pan can straddle Blender's -180/+180 Euler boundary.
    # Unwrap yaw before keying or an aisle move becomes a full camera spin.
    previous_yaw=cam.get("last_keyed_yaw")
    if previous_yaw is not None:
        while cam.rotation_euler.z-previous_yaw>math.pi: cam.rotation_euler.z-=math.tau
        while cam.rotation_euler.z-previous_yaw<-math.pi: cam.rotation_euler.z+=math.tau
    cam["last_keyed_yaw"]=cam.rotation_euler.z
    cam.keyframe_insert(data_path="location",frame=frame)
    cam.keyframe_insert(data_path="rotation_euler",frame=frame)
    cam.data.keyframe_insert(data_path="lens",frame=frame)

# A stocked, lit store with recognizable architectural scale and material contrast.
box("tiled store floor", (0,0,-.095), (20,25,.17), FLOOR, .025)
WALL=material("deep slate store wall",(.085,.125,.132),.79)
CEILING=material("light ceiling fascia",(.30,.37,.38),.61,.12)
SIGN=material("wayfinding sign charcoal",(.078,.11,.115),.55,.14)
LIGHT=material("diffused retail luminaire",(.7,.83,.81),.4,0,(.72,.9,.86),1.8)
PRICE=material("paper shelf price rail",(.72,.72,.65),.84)
GLASS=material("cooler glass muted reflection",(.20,.30,.32),.22,.18)
for name,loc,size in (
    ("back store wall",(0,12.2,1.95),(13.2,.18,3.9)),
    ("left store wall",(-9.2,0,1.95),(.16,24.2,3.9)),
    ("right store wall",(9.2,0,1.95),(.16,24.2,3.9)),
):grow_with_store(box(name,loc,size,WALL,.025))
# A refrigerated run closes the sightline so the first aisle is a real store,
# not shelves fading into an empty grey wall.
grow_with_store(box("rear refrigerated bay",(0,11.94,1.51),(11.0,.29,3.02),SHELF,.027))
grow_with_store(box("refrigerated fascia",(0,11.73,3.16),(11.1,.12,.31),SIGN,.02))
for idx in range(8):
    xx=-4.72+idx*1.35
    grow_with_store(box("cooler glass door",(xx,11.765,1.51),(1.25,.035,2.61),GLASS,.012))
    grow_with_store(box("cooler frame",(xx-.625,11.73,1.51),(.035,.065,2.7),SHELF_FACE,.006))
    grow_with_store(box("cooler handle",(xx+.46,11.70,1.48),(.026,.06,.75),SHELF_FACE,.008))
    for row in range(4):
        for col in range(3):
            grow_with_store(box("refrigerated stock",(xx-.34+col*.30,11.87,.52+row*.54),(.18,.09,.34),
                                (STOCK_A,STOCK_B,STOCK_C)[(idx+row+col)%3],.012))
# A second chilled run fills the long right perimeter visible at the final
# route turn. It stays behind the walking corridor and gives the aisle depth.
grow_with_store(box("right perimeter cooler bank",(8.72,-.25,1.53),(.53,10.1,3.06),SHELF,.026))
grow_with_store(box("right perimeter cooler header",(8.36,-.25,3.16),(.13,10.2,.30),SIGN,.018))
for idx in range(7):
    yy=-4.45+idx*1.4
    grow_with_store(box("right cooler door",(8.40,yy,1.50),(.035,1.30,2.61),GLASS,.010))
    grow_with_store(box("right cooler vertical frame",(8.36,yy-.65,1.50),(.07,.035,2.70),SHELF_FACE,.005))
    grow_with_store(box("right cooler handle",(8.32,yy+.46,1.47),(.075,.028,.72),SHELF_FACE,.007))
    for row in range(4):
        for col in range(3):
            grow_with_store(box("right cooler stock",(8.47,yy-.36+col*.32,.52+row*.54),(.13,.21,.35),
                                (STOCK_A,STOCK_B,STOCK_C)[(idx+row+col)%3],.010))
if KIND not in ("P3","P7"):
    for x in (-5.15,-2.7,0,2.7,5.15):
        for yy in (-5.3,-1.5,2.3):
            housing=box("suspended linear light",(x,yy,3.75),(.20,2.6,.10),CEILING,.03)
            lens=box("softbox lens",(x,yy,3.685),(.15,2.48,.025),LIGHT,.01)
            grow_with_store(housing);grow_with_store(lens)
for sidx,s in enumerate(LAYOUT["shelves"]):
    x,y=s["x"],s["y"];w,l,h=s["width"],s["length"],s["height"]
    # Open steel rack: thin center spine, real shelves, posts, toe kick and price rails.
    for ob in (
        box(s["id"]+" center spine",(x,y,1.34),(.10,l,2.43),SHELF,.018),
        box(s["id"]+" base plinth",(x,y,.105),(w,l,.21),SHELF_FACE,.022),
        box(s["id"]+" header",(x,y,2.55),(w,l,.16),SIGN,.025),
    ):grow_with_store(ob)
    for end in (-1,1):
        for side in (-1,1):
            post=box(s["id"]+" steel upright",(x+side*(w/2-.03),y+end*(l/2-.04),1.32),(.055,.07,2.44),SHELF_FACE,.008)
            grow_with_store(post)
    for level_index,base_z in enumerate((.23,.67,1.11,1.55,1.99)):
        tray=box(s["id"]+" shelf deck",(x,y,base_z),(w,l-.13,.045),SHELF_FACE,.01)
        grow_with_store(tray)
        for side in (-1,1):
            lip=box(s["id"]+" price rail",(x+side*(w/2+.006),y,base_z+.012),(.026,l-.16,.055),PRICE,.004)
            grow_with_store(lip)
            for yi in range(18):
                yy=y-l/2+.31+yi*.375
                if s["id"]=="S4" and side==1 and level_index==2 and yy>2.27:
                    continue # reserve the exact milk destination on this same shelf
                kind=(yi//3+level_index*2+sidx+int(side>0))%len(LABEL_NAMES)
                width=.25 if kind in (0,3,4) else .28
                height=.31 if kind in (0,3,4) else (.34 if yi%4 else .38)
                depth=.29 if kind in (0,3,4) else .27
                xx=x+side*(w/2-depth/2-.028)
                if kind in (5,7) and level_index in (0,2,4):
                    item=scanned_can(f'{s["id"]} scanned grocery can',
                                     (x+side*(w/2-.11),yy,base_z+.027),
                                     "tomatoes" if (yi+sidx)%2 else "beans")
                else:
                    item=product_box(f'{s["id"]} {LABEL_NAMES[kind]} package',
                                     (xx,yy,base_z+.045+height/2),(depth,width,height),side,kind)
                grow_with_store(item)
    for end in (-1,1):
        cap=box(s["id"]+" end panel",(x,y+end*(l/2+.005),1.30),(w,.045,2.38),SHELF,.006)
        grow_with_store(cap)
    # Aisle identifiers are part of the store, not an abstract black void.
    sign=box(s["id"]+" suspended aisle sign",(x,3.6,3.17),(1.22,.10,.40),SIGN,.025)
    grow_with_store(sign)
    name=bpy.data.curves.new(s["id"]+" sign type","FONT");name.body=f"{sidx+1:02d}  {('FRISCH','VORRAT','GETRÄNKE','MILCH')[sidx]}"
    name.size=.115;name.align_x="CENTER";name.align_y="CENTER"
    lettering=bpy.data.objects.new(s["id"]+" department lettering",name)
    bpy.context.collection.objects.link(lettering);lettering.location=(x,3.53,3.12)
    lettering.rotation_euler=(math.pi/2,0,0);lettering.data.materials.append(LIGHT)
    grow_with_store(lettering)

def shopper(x,y,angle=0,hide_reach_arm=False):
    """Clothed adult silhouette with separate articulated limb volumes."""
    static=[]
    def body(ob):
        static.append((ob,ob.location.copy()))
        return ob
    # The coat is one smoothed loft with a waist, shoulder slope and lower hem.
    rings=[(.76,.27,.19),(.82,.30,.20),(.98,.29,.18),(1.16,.27,.17),
           (1.35,.31,.19),(1.46,.35,.21),(1.56,.30,.18),(1.65,.13,.12)]
    n=32;verts=[];faces=[]
    for z,rx,ry in rings:
        verts.extend((x+math.cos(2*math.pi*i/n)*rx,y+math.sin(2*math.pi*i/n)*ry,z) for i in range(n))
    for j in range(len(rings)-1):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.extend([tuple(reversed(range(n))),tuple((len(rings)-1)*n+i for i in range(n))])
    mesh=bpy.data.meshes.new("tailored coat mesh");mesh.from_pydata(verts,[],faces);mesh.update()
    coat=bpy.data.objects.new("tailored coat",mesh);bpy.context.collection.objects.link(coat)
    coat.data.materials.append(COAT)
    subdiv=coat.modifiers.new("tailored silhouette","SUBSURF");subdiv.levels=1;subdiv.render_levels=1
    for poly in mesh.polygons:poly.use_smooth=True
    body(coat)
    body(box("raised coat collar",(x,y,1.61),(.34,.28,.09),COAT_EDGE,.034))
    body(tapered("neck",(x,y,1.69),.068,.072,.16,HEAD,.007))
    body(sphere("adult faceless head",(x,y,1.85),(.14,.15,.20),HEAD))
    body(sphere("dark close-fitting hair",(x,y+.006,1.98),(.145,.155,.085),COAT_EDGE))
    body(curve_line("coat back seam",[(x,y+.188,.82),(x,y+.197,1.12),(x,y+.192,1.41)],.002,COAT_THREAD))
    arms=[];legs=[]
    for side in (-1,1):
        if not(hide_reach_arm and side==1):
            upper=tapered("jacket upper sleeve",(x+side*.35,y,1.30),.085,.11,1,COAT,.016)
            lower=tapered("jacket cuff sleeve",(x+side*.38,y,1.03),.07,.083,1,COAT,.012)
            palm=sphere("gloved hand",(x+side*.39,y,.91),(.066,.075,.09),HEAD)
            arms.append((side,upper,lower,palm))
        thigh=tapered("tailored trouser thigh",(x+side*.16,y,.69),.094,.128,1,COAT_EDGE,.016)
        calf=tapered("tailored trouser calf",(x+side*.16,y,.29),.072,.095,1,COAT_EDGE,.012)
        shoe=box("structured walking shoe",(x+side*.16,y-.045,.075),(.18,.31,.14),COAT_EDGE,.032)
        legs.append((side,thigh,calf,shoe))
    figure={"origin":Vector((x,y,0)),"static":static,"arms":arms,"legs":legs}
    pose_shopper(figure,1,Vector((0,0,0)),Vector((0,1,0)),0,insert=False)
    return figure

def pose_shopper(figure,frame,translation,heading,phase,insert=True):
    """Knee bend, planted feet, counter-swing and subtle torso bob keyed by frame."""
    pos=figure["origin"]+translation
    forward=Vector((heading.x,heading.y,0))
    if forward.length<.001:forward=Vector((0,1,0))
    forward.normalize();right=Vector((-forward.y,forward.x,0))
    walking=1 if phase else 0
    bob=.012*walking*(1-math.cos(2*phase))
    for ob,base in figure["static"]:
        ob.location=base+translation+Vector((0,0,bob))
        if insert:ob.keyframe_insert(data_path="location",frame=frame)
    for side,upper,lower,hand in figure["arms"]:
        swing=math.sin(phase+(0 if side<0 else math.pi))*walking
        shoulder=pos+right*side*.31+Vector((0,0,1.47+bob))
        elbow=pos+right*side*.37-forward*swing*.10+Vector((0,0,1.19+bob))
        wrist=pos+right*side*.39-forward*swing*.22+Vector((0,0,.91+bob))
        pose_segment(upper,shoulder,elbow,frame)
        pose_segment(lower,elbow,wrist,frame)
        hand.location=wrist
        if insert:hand.keyframe_insert(data_path="location",frame=frame)
    for side,thigh,calf,shoe in figure["legs"]:
        stride=math.sin(phase+(0 if side>0 else math.pi))*walking
        lift=max(0,stride)*.075
        hip=pos+right*side*.155+Vector((0,0,.83+bob))
        ankle=pos+right*side*.155+forward*stride*.16+Vector((0,0,.12+lift))
        knee=(hip+ankle)*.5+forward*(.075+max(0,-stride)*.06)+Vector((0,0,.025))
        pose_segment(thigh,hip,knee,frame)
        pose_segment(calf,knee,ankle,frame)
        shoe.location=ankle-forward*.055+Vector((0,0,-.045))
        shoe.rotation_euler.z=math.atan2(forward.y,forward.x)-math.pi/2
        if insert:
            shoe.keyframe_insert(data_path="location",frame=frame)
            shoe.keyframe_insert(data_path="rotation_euler",frame=frame)

def animate_shopper_path(figure,keypoints,last_frame,stride_frames=21):
    for frame in range(1,last_frame+1):
        for (f0,x0,y0),(f1,x1,y1) in zip(keypoints,keypoints[1:]):
            if frame<=f1:
                u=max(0,min(1,(frame-f0)/(f1-f0)))
                eased=u*u*(3-2*u)
                dx=x0+(x1-x0)*eased;dy=y0+(y1-y0)*eased
                direction=Vector((x1-x0,y1-y0,0));break
        else:
            _,dx,dy=keypoints[-1];direction=Vector((0,1,0))
        pose_shopper(figure,frame,Vector((dx,dy,0)),direction,math.tau*frame/stride_frames)

def rigged_shopper(x,y,walking=False):
    """Continuous skinned CC0 body and real walk rig; no detached mannequin joints."""
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/"assets/character/rigged-shopper-base.glb"))
    added=list(set(bpy.data.objects)-before)
    root=next(o for o in added if o.name.startswith("RootNode"))
    rig=next(o for o in added if o.type=="ARMATURE")
    mesh=next(o for o in added if o.type=="MESH" and o.name.startswith("Human_Mesh"))
    for ob in added:
        if ob.type in {"CAMERA","LIGHT"} or ob.name.startswith(("Cube","Icosphere")):
            bpy.data.objects.remove(ob,do_unlink=True)
    root.scale=(.34,.34,.34);root.location=(x,y,0)
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.mode_set(mode="EDIT");bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=.00001)
    bpy.ops.object.mode_set(mode="OBJECT")
    for poly in mesh.data.polygons:poly.use_smooth=True
    subdiv=mesh.modifiers.new("smooth human topology","SUBSURF")
    subdiv.levels=1;subdiv.render_levels=1
    mesh.data.materials.clear()
    for mat in (COAT,COAT_EDGE,HEAD,INK):mesh.data.materials.append(mat)
    bpy.context.view_layer.update()
    for poly in mesh.data.polygons:
        z=(mesh.matrix_world@poly.center).z
        poly.material_index=2 if 1.53<z<1.73 else (3 if z>=1.73 or z<.12 else (1 if z<.82 else 0))
    action=next(a for a in bpy.data.actions if a.name.endswith("|Walk" if walking else "|Idle"))
    if rig.animation_data is None:rig.animation_data_create()
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new()
    strip=track.strips.new("natural shopper gait" if walking else "breathing pause",1,action)
    strip.scale=1.5 if walking else 1
    strip.repeat=5
    return root

def animate_rigged_path(root,keypoints,last_frame):
    initial=root.location.copy()
    for frame in range(1,last_frame+1):
        for (f0,x0,y0),(f1,x1,y1) in zip(keypoints,keypoints[1:]):
            if frame<=f1:
                u=max(0,min(1,(frame-f0)/(f1-f0)))
                eased=u*u*(3-2*u)
                dx=x0+(x1-x0)*eased;dy=y0+(y1-y0)*eased
                heading=Vector((x1-x0,y1-y0,0));break
        else:
            _,dx,dy=keypoints[-1];heading=Vector((0,-1,0))
        root.location=initial+Vector((dx,dy,0))
        root.rotation_euler.z=math.atan2(heading.x,-heading.y)
        root.keyframe_insert(data_path="location",frame=frame)
        root.keyframe_insert(data_path="rotation_euler",frame=frame)

# Shared route, visually grounded and walkable.
routepts=[(p["x"],p["y"],.035) for p in LAYOUT["route"]]
if KIND in ("P3","P4","P5","P6","P7"):
    path=curve_line("same path in world",routepts,.029,MINT)
    path.data.bevel_factor_end=0.0 if KIND=="P3" else (.92 if KIND=="P4" else 1)
    path.data.keyframe_insert(data_path="bevel_factor_end",frame=1)
    path.data.bevel_factor_end=1
    path.data.keyframe_insert(data_path="bevel_factor_end",frame=85 if KIND=="P3" else (60 if KIND=="P4" else FRAME_COUNT))

if KIND=="P1":
    person=rigged_shopper(-5.1,-5.2)
    ph=box("held phone",(-4.70,-5.39,1.14),(.20,.045,.38),SHELF_FACE,.035)
    ph.keyframe_insert(data_path="location",frame=70)
    ph.location.z=1.55; ph.location.x=-4.62; ph.keyframe_insert(data_path="location",frame=98)
    # Controlled light hierarchy; geometry stays fixed.
    key=area("shopper reveal key",(-5,-4,6),650,(.44,.72,.69),5,(-5,-5,1))
    key.data.energy=400;key.data.keyframe_insert(data_path="energy",frame=74)
    key.data.energy=1000;key.data.keyframe_insert(data_path="energy",frame=105)
    area("aisle streak",(2,-2,5),600,(.43,.72,.76),7,(0,0,0))
    camd=bpy.data.cameras.new("cinema camera"); cam=bpy.data.objects.new("cinema camera",camd);bpy.context.collection.objects.link(cam);scene.camera=cam
    cam_key(cam,1,(0,-6.4,.65),(0,-1.7,1.3),29)
    cam_key(cam,34,(0,-2.1,.7),(0,2.4,1.4),29)
    cam_key(cam,58,(2.7,-1.8,1.05),(2.8,3.6,1.1),30)
    cam_key(cam,75,(-1.8,-7.2,7.0),(-4.55,-4.4,1.1),34)
    cam_key(cam,120,(-2.6,-7.5,6.5),(-4.85,-4.8,1.2),43)
elif KIND=="P3":
    # The top-down footprints rise continuously into store architecture as the camera descends.
    area("overhead key",(0,0,12),1150,(.46,.78,.72),12,(0,0,0))
    area("side mint",(6,1,5),600,(.31,.76,.61),8,(1,0,0))
    camd=bpy.data.cameras.new("map entry camera");cam=bpy.data.objects.new("map entry camera",camd);bpy.context.collection.objects.link(cam);scene.camera=cam
    cam_key(cam,1,(0,-2,14),(0,-1,0),27)
    cam_key(cam,35,(0,-2,10),(0,-1,0),28)
    cam_key(cam,56,(0,-3,7),(0,-1,0),30)
    cam_key(cam,85,(0,-4.8,3.4),(0,1,1),31)
    cam_key(cam,120,(0,-3.8,1.35),(0,3,1.05),35)
    person=rigged_shopper(0,4.5)
elif KIND=="P5":
    # Carry P3's forward direction into a low, accelerating route chase.
    # Viewer's own camera follows the route; a frontal game-character view failed.
    area("low route rim",(0,2.5,4.0),650,(.25,.78,.66),6,(0,1,.3))
    camd=bpy.data.cameras.new("low route chase camera")
    cam=bpy.data.objects.new("low route chase camera",camd);bpy.context.collection.objects.link(cam);scene.camera=cam
    cam_key(cam,1,(0,-3.8,1.35),(0,3,1.05),35)
    cam_key(cam,35,(0,-.1,.62),(0,4.3,.42),32)
    cam_key(cam,75,(0,2.2,.75),(2.65,4.8,.75),34)
elif KIND=="P6":
    # A lateral move reveals the same shopper as the route turns right.
    person=rigged_shopper(2.1,4.8,walking=True)
    animate_rigged_path(person,[(1,0,0),(48,.9,0),(75,.9,-.75)],75)
    area("lateral shopper edge",(3.1,6.4,4.5),700,(.40,.79,.73),5,(3,4.5,1))
    camd=bpy.data.cameras.new("lateral reveal camera")
    cam=bpy.data.objects.new("lateral reveal camera",camd);bpy.context.collection.objects.link(cam);scene.camera=cam
    cam_key(cam,1,(-1.4,10.9,1.65),(2.1,4.8,1.2),31)
    cam_key(cam,38,(1.25,10.9,1.55),(2.75,4.65,1.05),31)
    cam_key(cam,75,(4.3,10.9,1.6),(3.0,3.95,1.05),30)
elif KIND=="P7":
    # Stay inside the first aisle until the endcap clears, then turn right.
    # This is the viewer's path preview; the shopper returns through the hand beat.
    area("overhead navigation key",(3,-1,9),1100,(.42,.79,.72),11,(3,0,0))
    camd=bpy.data.cameras.new("overhead to turn camera")
    cam=bpy.data.objects.new("overhead to turn camera",camd);bpy.context.collection.objects.link(cam);scene.camera=cam
    cam_key(cam,1,(3.0,4.35,2.20),(3.0,-2.8,.25),31)
    cam_key(cam,45,(3.0,-2.4,1.55),(3.0,-5.0,1.05),32)
    cam_key(cam,60,(3.0,-5.35,1.25),(3.45,-5.0,1.0),32)
    cam_key(cam,70,(4.85,-5.45,1.27),(5.05,1.0,1.05),32)
    cam_key(cam,90,(5.0,-4.0,1.28),(5.05,2.3,1.05),34)
else:
    # Destination uses a cropped human interaction; the draft full-body figure
    # could not support a credible hero closeup.
    # Warm generic milk carton mounted on target shelf face.
    product_box("destination milk carton",(4.52,2.7,1.38),(.24,.33,.49),1,0)
    roof_verts=[(4.42,2.53,1.625),(4.62,2.53,1.625),(4.62,2.87,1.625),(4.42,2.87,1.625),
                (4.52,2.53,1.79),(4.52,2.87,1.79)]
    roof_faces=[(0,1,4),(3,5,2),(0,4,5,3),(1,2,5,4),(0,3,2,1)]
    roof_mesh=bpy.data.meshes.new("folded carton roof mesh")
    roof_mesh.from_pydata(roof_verts,[],roof_faces);roof_mesh.update()
    roof=bpy.data.objects.new("folded milk carton roof",roof_mesh)
    bpy.context.collection.objects.link(roof);roof.data.materials.append(MILK_TOP)
    # The customer's sleeve enters from outside the frame. A small articulated
    # glove silhouette touches the pack; no mannequin torso appears in closeup.
    sleeve=tapered("reaching cropped jacket sleeve",(5.3,1.9,1.2),.068,.11,1,COAT,.018)
    cuff=tapered("jacket cuff",(5.0,2.3,1.2),.072,.078,1,COAT_EDGE,.009)
    hand=realistic_hand()
    for f,wrist in ((74,(5.25,2.08,1.09)),(114,(4.92,2.60,1.45))):
        start=(5.65,1.49,1.28)
        pose_segment(sleeve,start,wrist,f)
        cuff_start=Vector(wrist)*.82+Vector(start)*.18
        pose_segment(cuff,cuff_start,wrist,f)
        hand.location=wrist;hand.keyframe_insert(data_path="location",frame=f)
    area("destination milk key",(4.9,2.5,4.6),550,(.72,.96,.83),3,(4.3,2.7,1.2))
    area("shopper rim",(6,0,3),300,(.30,.70,.64),4,(5,2,1))
    camd=bpy.data.cameras.new("arrival camera");cam=bpy.data.objects.new("arrival camera",camd);bpy.context.collection.objects.link(cam);scene.camera=cam
    cam_key(cam,1,(5.0,-5.6,.64),(5.0,-1.0,.48),32)
    cam_key(cam,45,(5.08,-1.6,.85),(5.0,2.3,.8),34)
    cam_key(cam,80,(7.7,4.4,2.45),(4.52,2.7,1.38),64)
    cam_key(cam,120,(7.3,4.15,2.25),(4.52,2.7,1.38),100)

# A deep background, restrained ambient light and contact shadows.
world=bpy.data.worlds.new("dark ambient")
scene.world=world;world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.065,.10,.11,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.48
area("broad ceiling",(0,0,8),1250,(.84,.88,.85),11,(0,0,0))
for light_x in (-5.1,0,5.1):
    for light_y in (-4,1.5):
        area("practical aisle light",(light_x,light_y,3.67),180,(.85,.92,.88),2.5,(light_x,light_y,0))
scene.camera.data.clip_end=200
scene.render.engine="BLENDER_EEVEE"
scene.render.filepath=str(outdir/"frame_")
tracked={
    "P1":{"shopper":(-5.1,-5.2,1.4),"phone":(-4.62,-5.39,1.55)},
    "P3":{"routeStart":(-5.1,-5.2,.04),"routeCenter":(0,-1,.04)},
    "P4":{"destination":(5.05,2.7,.04),"milk":(4.52,2.7,1.38)}
}.get(KIND,{})
projection=[]
for f in range(1,FRAME_COUNT+1):
    scene.frame_set(f)
    projection.append({name:dict(x=round((q:=world_to_camera_view(scene,scene.camera,Vector(point))).x*1280,2),
                                 y=round((1-q.y)*720,2),visible=q.z>0)
                       for name,point in tracked.items()})
if tracked:
    (outdir/"projection.json").write_text(json.dumps(projection,separators=(",",":")))
if RANGE is not None:
    start,end=RANGE
    if not 1<=start<=end<=FRAME_COUNT: raise ValueError(f"range must be 1..{FRAME_COUNT}")
    scene.frame_start,scene.frame_end=start,end
    scene.render.resolution_percentage=50  # motion gate, not image-quality review
    bpy.ops.render.render(animation=True)
elif STILL is None:
    bpy.ops.render.render(animation=True)
else:
    if not 1<=STILL<=FRAME_COUNT: raise ValueError(f"still_frame must be 1..{FRAME_COUNT}")
    scene.frame_set(STILL)
    scene.render.filepath=str(outdir/f"still_{STILL:04d}.png")
    bpy.ops.render.render(write_still=True)
