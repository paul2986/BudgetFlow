// Gives the iOS launch screen a full-bleed image behind the logo.
//
// expo-splash-screen only supports a flat colour behind its logo. The launch
// screen wants the brand gradient (assets/images/splash-background.png), so
// this plugin:
// - copies that image into the asset catalog as SplashScreenGradient,
// - adds an aspect-fill image view pinned to all four edges of the storyboard,
//   behind the logo, and registers the image resource.
//
// Register it BEFORE 'expo-splash-screen' in app.config.ts. Mods run
// last-registered-first, and expo-splash-screen's logo step resets the
// storyboard's constraints and image resources, so this has to run after it.
//
// components/AnimatedSplash.tsx draws the same image and logo, so the hand-off
// from this launch screen to the animated one is seamless. The logo's size
// (imageWidth) must match LOGO_SIZE there.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withMod } = require('@expo/config-plugins');

const SOURCE = 'assets/images/splash-background.png';
const IMAGE_NAME = 'SplashScreenGradient';
const VIEW_ID = 'EXPO-SplashBackground';
const CONTAINER_ID = 'EXPO-ContainerView';

function pngSize(file) {
    const header = fs.readFileSync(file).subarray(0, 24);
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function constraint(attribute) {
    return {
        $: {
            firstItem: VIEW_ID,
            firstAttribute: attribute,
            secondItem: CONTAINER_ID,
            secondAttribute: attribute,
            // Stable ids so re-running prebuild doesn't churn the file.
            id: crypto.createHash('sha1').update(`${VIEW_ID}-${attribute}`).digest('hex'),
        },
    };
}

function withGradientAsset(config) {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const { projectRoot } = config.modRequest;
            const imageset = path.join(
                IOSConfig.Paths.getSourceRoot(projectRoot),
                'Images.xcassets',
                `${IMAGE_NAME}.imageset`
            );
            await fs.promises.rm(imageset, { force: true, recursive: true });
            await fs.promises.mkdir(imageset, { recursive: true });
            // One file, no scale suffix: the view aspect-fills it, so it is
            // scaled to the screen whatever its pixel size.
            await fs.promises.copyFile(path.join(projectRoot, SOURCE), path.join(imageset, 'image.png'));
            await fs.promises.writeFile(
                path.join(imageset, 'Contents.json'),
                JSON.stringify(
                    {
                        images: [{ idiom: 'universal', filename: 'image.png' }],
                        info: { version: 1, author: 'expo' },
                    },
                    null,
                    2
                )
            );
            return config;
        },
    ]);
}

function withGradientStoryboard(config) {
    return withMod(config, {
        platform: 'ios',
        mod: 'splashScreenStoryboard',
        action: async (config) => {
            const xml = config.modResults;
            const mainView = xml.document.scenes[0].scene[0].objects[0].viewController[0].view[0];
            const { width, height } = pngSize(path.join(config.modRequest.projectRoot, SOURCE));

            const subviews = mainView.subviews[0];
            subviews.imageView = (subviews.imageView || []).filter((view) => view.$.id !== VIEW_ID);
            // First subview = furthest back, so the logo draws over it.
            subviews.imageView.unshift({
                $: {
                    id: VIEW_ID,
                    userLabel: IMAGE_NAME,
                    image: IMAGE_NAME,
                    contentMode: 'scaleAspectFill',
                    clipsSubviews: true,
                    userInteractionEnabled: false,
                    translatesAutoresizingMaskIntoConstraints: false,
                },
                rect: [{ $: { key: 'frame', x: 0, y: 0, width: 393, height: 852 } }],
            });

            const constraints = mainView.constraints[0];
            constraints.constraint = (constraints.constraint || []).filter((c) => c.$.firstItem !== VIEW_ID);
            for (const edge of ['top', 'leading', 'trailing', 'bottom']) {
                constraints.constraint.push(constraint(edge));
            }

            const resources = xml.document.resources[0];
            resources.image = (resources.image || []).filter((image) => image.$.name !== IMAGE_NAME);
            resources.image.push({ $: { name: IMAGE_NAME, width, height } });

            return config;
        },
    });
}

module.exports = (config) => withGradientStoryboard(withGradientAsset(config));
