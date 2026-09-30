# V2 look-development assets and rights

These assets support a new **look test**, not a cleared final advertisement. The old 26-second rough cut uses its previous assets and remains reproducible separately.

| Asset | Source and license | Use |
|---|---|---|
| `pbr/interior_tiles_*`, `pbr/denim_fabric_03_*` | [Poly Haven texture pages](https://polyhaven.com/textures), [CC0 license](https://polyhaven.com/license). Exact download URLs and SHA-256 hashes are in `pbr/SOURCES.txt`. | 1K diffuse, roughness and OpenGL normal maps for the floor and garment study. |
| `character/hand-realistic.blend` | Extracted from Blender Studio's [Human Base Meshes bundle](https://www.blender.org/download/demo-files/) v1.2.0, which Blender lists as CC0. `scripts-extract-hand.py` records the extraction. | Anatomical hand test at the milk carton. The pose and sleeve still need art direction. |
| `character/rigged-shopper-base.glb` | Quaternius original CC0 human with walk/idle rig, redistributed as `assets/human.glb` in the [UMRAM Bilkent repository](https://github.com/UMRAM-Bilkent/supine-human-model/blob/main/README.md#source--license). | Distant motion and scale test. This model is still too game-like for a premium hero shot. |
| `product-labels/*.png` | Original generated artwork from `scripts-generate-product-labels.py`; no outside brand imagery. | Illustrative grocery stock only. `NORD & NAH` is fictional packaging, not an Indooro or retailer claim. |
| `models/long_life_food/*` | [Poly Haven Long Life Food](https://polyhaven.com/a/long_life_food), CC0. The 1K glTF and its four included files came from the [Poly Haven API](https://api.polyhaven.com/files/long_life_food). | Scanned can geometry and embedded image-based materials add variety to the rack study. The asset's milk model is not used as Indooro's target carton. |

The source-only character downloads under `assets/character-source/` are local, ignored staging files. The two compact derived models, active PBR maps and food scan are kept in Git for offline reproduction. No approval of a face, wardrobe, shopper performance, official logo, final product claims or soundtrack is implied.
