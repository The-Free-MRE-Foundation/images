/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Actor, AlphaMode, AssetContainer, BoxAlignment, ButtonBehavior, ColliderType, CollisionLayer, Color3, Color4, Context, DegreesToRadians, ParameterSet, PlanarGridLayout, Quaternion, ScaledTransformLike, TextAnchorLocation, User } from "@microsoft/mixed-reality-extension-sdk";
import { translate } from './utils';

import crypto from 'crypto';
const sha256 = (x: string) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');

const { exec } = require('child_process');

const WORK_DIR = process.env['WD'];
const API_KEY = process.env['API_KEY'];

enum Engines {
        CRAIYON = 'CRAIYON',
        STABLE_HORDE = 'STABLE_HORDE',
}

const GALLERY_OPTIONS: GalleryOptions = {
        dimensions: {
                width: 0.4,
                height: 0.4,
        },
        size: {
                row: 3,
                col: 3
        },
        margin: 0.01,
        button: {
                transform: {
                        position: {
                                x: 0, y: -0.1, z: 0,
                        },
                        rotation: {
                                x: 0, y: 180, z: 0,
                        }
                },
                clips: {
                        idle: 'artifact:2109625984163512461',
                        sleep: 'artifact:2109625984289341582',
                        activate: 'artifact:2109625983895077003',
                        deactivate: 'artifact:2109625984029294732',
                },
                dimensions: {
                        width: 0.4,
                        height: 0.7,
                        depth: 0.4
                }
        }
}

const NUM_IMAGES = 9;

interface GalleryOptions {
        dimensions: {
                width: number,
                height: number
        },
        size: {
                row: number,
                col: number,
        },
        margin: number,
        button: {
                transform: Partial<ScaledTransformLike>,
                clips: { [name: string]: string },
                dimensions: {
                        width: number,
                        height: number,
                        depth: number
                },
        }
}

/**
 * The main class of this app. All the logic goes here.
 */
export default class App {
        private assets: AssetContainer;
        private running: boolean = false;
        private anchor: Actor;
        private grid: PlanarGridLayout;
        private cells: Actor[];

        private _clip: string;
        get clip() {
                return this._clip;
        }
        set clip(c: string) {
                if (this._clip == c) return;
                this._clip = c;
                if (this._clip) {
                        this.animation?.destroy();
                }
                const resourceId = GALLERY_OPTIONS.button.clips[c];
                const local = translate(GALLERY_OPTIONS.button.transform).toJSON();
                this.animation = Actor.CreateFromLibrary(this.context, {
                        resourceId,
                        actor: {
                                parentId: this.button.id,
                                transform: {
                                        local
                                }
                        }
                });

        }
        private button: Actor;
        private animation: Actor;

        private textActor: Actor;
        set text(t: string) {
                this.textActor.text.contents = t;
        }

        constructor(private context: Context, params: ParameterSet) {
                this.assets = new AssetContainer(this.context);
                this.assets.createMaterial('debug', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });


                this.context.onStarted(() => this.started());
                this.context.onUserJoined((u: User) => this.userjoined(u));
                this.context.onUserLeft((u: User) => this.userleft(u));
        }

        /**
         * Once the context is "started", initialize the app.
         */
        private async started() {
                this.init();
        }

        private async userjoined(user: User) {
        }

        private async userleft(user: User) {
        }

        private init() {
                this.preload();
                this.createAnchor();
                this.createGallery();
                this.createButton();
                this.createText();
                this.clip = 'sleep';
        }

        private preload() {
                [...Object.keys(GALLERY_OPTIONS.button.clips)].forEach(k => {
                        const resourceId = GALLERY_OPTIONS.button.clips[k];
                        Actor.CreateFromLibrary(this.context, {
                                resourceId,
                                actor: {
                                        transform: {
                                                local: {
                                                        scale: {
                                                                x: 0.000001,
                                                                y: 0.000001,
                                                                z: 0.000001,
                                                        }
                                                }
                                        },
                                        appearance: {
                                                enabled: false
                                        }
                                }
                        });
                });
        }

        private createAnchor() {
                const options = GALLERY_OPTIONS;
                this.anchor = Actor.Create(this.context, {
                        actor: {
                                transform: {
                                        local: {
                                                position: {
                                                        x: 0,
                                                        y: (options.margin * (options.size.row - 1) + options.dimensions.height * options.size.row) / 2 + options.button.dimensions.height / 2 + 0.1 + 0.1,
                                                        z: 0
                                                }
                                        }
                                }
                        }
                });
                this.grid = new PlanarGridLayout(this.anchor);
        }

        private createButton() {
                const options = GALLERY_OPTIONS;
                // collider
                const dim = options.button.dimensions;
                let mesh = this.assets.meshes.find(m => m.name === 'debug_collider');
                if (!mesh) {
                        mesh = this.assets.createBoxMesh('debug_collider', dim.width, dim.height, dim.depth);
                }

                const material = this.assets.materials.find(m => m.name === 'debug');
                const local = translate({}).toJSON();
                this.button = Actor.Create(this.context, {
                        actor: {
                                name: 'debug',
                                transform: {
                                        local
                                },
                                appearance: {
                                        meshId: mesh.id,
                                        materialId: material.id,
                                },
                                collider: {
                                        geometry: {
                                                shape: ColliderType.Box
                                        },
                                        layer: CollisionLayer.Hologram
                                }
                        }
                });
                this.button.setBehavior(ButtonBehavior).onClick((user, _) => {
                        user.prompt("Text to image", true).then((dialog) => {
                                if (dialog.submitted) {
                                        if (this.running) {
                                                user.prompt('Task running please wait');
                                                return;
                                        }
                                        if (!dialog.text) {
                                                user.prompt('Query can\'t be empty');
                                                return;
                                        }
                                        this.tti(dialog.text, user);
                                }
                        });
                });
        }

        private createGallery() {
                const options = GALLERY_OPTIONS;

                const dim = GALLERY_OPTIONS.dimensions;
                let mesh = this.assets.meshes.find(m => m.name == 'button');
                if (!mesh) {
                        mesh = this.assets.createPlaneMesh('cell_plane', dim.width, dim.height);
                }
                let material = this.assets.materials.find(m => m.name == 'white');
                if (!material) {
                        material = this.assets.createMaterial('white', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
                }

                this.cells = [];
                [...Array(options.size.row).keys()].forEach(r => {
                        [...Array(options.size.col).keys()].forEach(c => {
                                const index = r * options.size.col + c;
                                if (index >= NUM_IMAGES) return;
                                const cell = Actor.Create(this.context, {
                                        actor: {
                                                parentId: this.anchor.id,
                                                transform: {
                                                        local: {
                                                                rotation: Quaternion.FromEulerAngles(-90 * DegreesToRadians, 0, 0)
                                                        }
                                                },
                                                appearance: {
                                                        meshId: mesh.id,
                                                        materialId: material.id,
                                                },
                                                collider: {
                                                        geometry: { shape: ColliderType.Box },
                                                        layer: CollisionLayer.Hologram
                                                }
                                        }
                                });
                                this.grid.addCell({
                                        row: r,
                                        column: c,
                                        width: dim.width + options.margin,
                                        height: dim.height + options.margin,
                                        contents: cell
                                });
                                this.cells.push(cell);
                        });
                });

                this.grid.gridAlignment = BoxAlignment.MiddleCenter;
                this.grid.applyLayout();
        }

        private createText() {
                const options = GALLERY_OPTIONS;
                this.textActor = Actor.Create(this.context, {
                        actor: {
                                parentId: this.button.id,
                                transform: {
                                        local: {
                                                position: {
                                                        x: 0,
                                                        y: options.button.dimensions.height / 2 + 0.15,
                                                        z: 0,
                                                }
                                        }
                                },
                                text: {
                                        contents: '',
                                        height: 0.1,
                                        color: Color3.White(),
                                        anchor: TextAnchorLocation.MiddleCenter
                                }
                        }
                });
        }

        private tti(query: string, user: User, engine: Engines = Engines.STABLE_HORDE) {
                if (this.running) return;
                this.clip = 'activate';
                this.text = `${user.name} prompted: ${query}`;
                this.clear();
                this.running = true;

                const prompt = `${query.replace(/[^a-zA-Z ]/g, ' ')}`;
                const h = sha256(prompt);

                let cmd: string;
                switch (engine) {
                        case Engines.CRAIYON:
                                cmd = `python craiyon.py ${prompt}`;
                                break;
                        case Engines.STABLE_HORDE:
                                cmd = `mkdir -p public/${h}; cwd=$(pwd); cd $(realpath ${WORK_DIR}); python cli_request.py --horde=https://stablehorde.net -n 9 -p '${prompt}' -w 512 -l 512 -s 7 -f ${h}.png -q --api_key '${API_KEY}'; ls *_${h}.png | while read line; do dst=$cwd/public/${h}/image-$(($(echo $line | cut -d_ -f1)+1)).png; mv $line $dst; done; echo ${prompt} >>$cwd/public/${h}/query`;
                                break;
                }

                exec(cmd, async (error: string, stdout: string, stderr: string) => {
                        this.onResult(error, stdout, stderr, query);
                });
        }

        private async onResult(error: string, stdout: string, stderr: string, query: string) {
                this.running = false;
                this.clip = 'deactivate';
                this.text = `${query}`;
                if (error) return;
                this.result(query);
        }

        private result(query: string) {
                const h = sha256(query);
                [...Array(NUM_IMAGES).keys()].forEach(i => {
                        const url = `eve/${h}/image-${i + 1}.png`;
                        // material
                        let tn = `texture_${url}`;
                        let texture = this.assets.textures.find(t => t.name === tn);
                        if (!texture) {
                                texture = this.assets.createTexture(tn, { uri: url });
                        }
                        let mn = `material_${url}`;
                        let material = this.assets.materials.find(m => m.name === mn);
                        if (!material) {
                                material = this.assets.createMaterial(mn, {
                                        emissiveColor: Color3.White(), emissiveTextureId: texture.id,
                                        color: Color3.White(), mainTextureId: texture.id,
                                        alphaMode: AlphaMode.Mask, alphaCutoff: 0,
                                });
                        }

                        this.cells[i].appearance.material = material;
                });
        }

        private clear() {
                let material = this.assets.materials.find(m => m.name == 'white');
                if (!material) {
                        material = this.assets.createMaterial('white', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
                }
                [...Array(NUM_IMAGES).keys()].forEach(i => {
                        this.cells[i].appearance.material = material;
                });
        }

}