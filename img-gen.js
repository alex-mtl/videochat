const fs = require('fs');
const path = require('path');
const svg2img = require('svg2img');
const sharp = require('sharp');
require('dotenv').config();

// Function to replace color in SVG
function replaceColor(svgContent, color) {
    return svgContent.replace(/fill="#[0-9a-fA-F]{6}"/g, `fill="${color}"`);
}

// Random color generator
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function addBackgroundColor(svgContent, backgroundColor) {
    // Extract the width and height from the SVG content
    const widthMatch = svgContent.match(/<svg[^>]*width="([^"]+)"[^>]*>/);
    const heightMatch = svgContent.match(/<svg[^>]*height="([^"]+)"[^>]*>/);

    if (!widthMatch || !heightMatch) {
        throw new Error('Width or height not found in SVG content');
    }

    const width = widthMatch[1];
    const height = heightMatch[1];

    // Create a <rect> element for the background
    // const backgroundRect = `<rect width="${width}" height="${height}" fill="${backgroundColor}" />`;
    const backgroundRect = `<rect x="0" y="-960" width="960" height="960" fill="${backgroundColor}" />`;

    // Insert the <rect> element right after the opening <svg> tag
    return svgContent.replace(/<svg[^>]*>/, `$&${backgroundRect}`);
}

// Generate avatar
async function generateAvatar() {
    // const templatesDir = path.join(__dirname, 'public/img/svg/');
    // const templateIndex = Math.floor(Math.random() * 10) + 1;
    const avatar = crypto.randomBytes(16).toString('hex')+Date.now();
    const outputFilePath = path.join(process.env.AVATAR_DIR, `${avatar}.png`);
    const templates = fs.readdirSync(process.env.AVATAR_TEMPLATES_DIR);
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

    const svgTemplatePath = path.join(process.env.AVATAR_TEMPLATES_DIR, randomTemplate);
    try {
        // Read SVG template
        let svgContent = fs.readFileSync(svgTemplatePath, 'utf8');
        const svgData = fs.readFileSync(svgTemplatePath, 'utf8');

        // Replace colors in SVG
        const randomColor = getRandomColor();
        svgContent = replaceColor(svgContent, randomColor);
        const backgroundColor = getRandomColor();
        svgContent = addBackgroundColor(svgContent, backgroundColor);

        fs.writeFileSync(outputFilePath.replace('.png', '.svg'), svgContent, 'utf8');
            // Save the image
            sharp(Buffer.from(svgContent))
                .resize(320,320)
                .png()
                .toFile(outputFilePath)
                .then(() => {
                    console.log('Avatar saved as', outputFilePath);
                })
                .catch(err => {
                    console.error('Error saving avatar:', err);
                });
        // });
    } catch (error) {
        console.error('Error generating avatar:', error);
    }
}



generateAvatar();
