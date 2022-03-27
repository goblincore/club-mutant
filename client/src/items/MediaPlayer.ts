import YoutubePlayer from 'phaser3-rex-plugins/plugins/youtubeplayer';

interface Props {
    scene: Phaser.Scene;
    x: number;
    y: number;
    width: number;
    height: number;
    config?: any;
}

export class LilYoutubePlayer extends YoutubePlayer {
    constructor({ scene, x, y, width, height, config }: Props) {
        super(scene, x, y, width, height, config);
        scene.add.existing(this);
    }
}
