const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const db = require('../../db')
const validator = require('validator');
const { countries } = require('../utils/countries')

require('dotenv').config();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 1 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only .jpg, .png, and .gif formats are allowed!'));
        }
    }
}).single('image'); // 'image' is the name of the form field

module.exports.upload = (req, res) => {
    if (!req.session.user) {
        return res.status(401).send({ error: 'Unauthorized: Please log in first.' });
    }
    upload(req, res, async (err) => {
        if (err) {
            // Handle specific multer errors
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).send({ error: 'File size should not exceed 1MB.' });
                }
                return res.status(400).send({ error: err.message });
            }

            // Handle other potential errors
            return res.status(400).send({ error: 'Failed to upload image: ' + err.message });
        }

        try {
            const image = sharp(req.file.buffer);
            const metadata = await image.metadata();

            // Check if the image is square and within the size limits
            if (metadata.width !== metadata.height || metadata.width > 512) {
                return res.status(400).send({error: 'Image must be square and not more than 512x512 pixels.'});
            }

            // Optionally, you can resize the image if it's larger than 512x512
            if (metadata.width > 512) {
                await image.resize(512, 512);
            }

            // Save the processed image (example path)
            // const outputPath = path.join(__dirname, 'uploads', req.file.originalname);
            const extname = path.extname(req.file.originalname).toLowerCase();
            const salt = crypto.randomBytes(8).toString('hex');
            const outputPath = path.join(process.env.AVATAR_DIR, `${salt}.${extname}`);
            await image.toFile(outputPath);
            const avatar_uri = outputPath.replace(process.env.APP_PUBLIC_DIR, '/static/')
            const [result] = await db.query(
                'UPDATE users SET avatar_url = ? WHERE id = ?',
                [avatar_uri, req.session.user.id]
            );
            if(result.affectedRows === 1) {
                const [user] = await db.query(
                    'SELECT * FROM users WHERE id = ?',
                    [req.session.user.id]
                );
                req.session.user = user[0]
            }
            console.log(result.affectedRows)
            return res.status(200).json({
                success: true,
                message: 'File uploaded and processed successfully!',
                avatar: avatar_uri
            });
        } catch (err) {
            res.status(500).send({error: 'Failed to process the image. : ' + err.message});
        }
    });
}

module.exports.updateUser = async (req, res) => {
    // Check if user is authenticated
    if (!req.session.user) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    let errors = []

    // Extract user data from the request body
    const { username, nickname, email, phone, firstName, lastName, country } = req.body;

    if (email.length !== 0 && !validator.isEmail(email)) {
        errors.push('Please enter valid email')
    }

    if (username.length === 0) {
        errors.push('Please enter valid username')
    } else {
        let [user] = await db.query(
            'SELECT * FROM users WHERE (username = ? OR nickname = ?) AND id <> ?',
            [username, username, req.session.user.id]
        );
        if (user.length > 0) {
            errors.push('Username or Nickname already exists. Please choose a different username.');
        }
    }

    if (username.length > 0) {
        let [user] = await db.query(
            'SELECT * FROM users WHERE (username = ? OR nickname = ?) AND id <> ?',
            [nickname, nickname, req.session.user.id]
        );
        if (user.length > 0) {
            errors.push('Username or Nickname already exists. Please choose a different nickname.');
        }
    }

    if (phone.length > 0) {
        const phoneDigits = phone.replace(/\D/g, ''); // Remove non-digits
        console.log(phoneDigits)
        console.log(req.session.user.id)
        if (phoneDigits.length < 10) {
            errors.push('Phone number must contain at least 10 digits.');
        } else {
            let [user] = await db.query(
                'SELECT * FROM users WHERE REGEXP_REPLACE(phone, \'[^0-9]\', \'\') = ? AND id <> ?',
                [phoneDigits, req.session.user.id]
            );
            console.log(user)
            console.log('LEN: ',user.length)
            if (user.length > 0) {
                errors.push('Phone number already exists. Please choose a different phone number.');
            }
        }

    }
    if (errors.length === 0) {
        const updateQuery = `
        UPDATE users
        SET username = ?, nickname = ?, email = ?, phone = ?, first_name = ?, last_name = ?, country = ?
        WHERE id = ?
    `;

        const values = [
            username,
            nickname,
            email,
            phone,
            firstName,
            lastName,
            country,
            req.session.user.id
        ];

        const [result] = await db.query(updateQuery, values);

        if (result.affectedRows === 1) {
            // Respond with updated data
            res.json({
                username,
                nickname,
                email,
                phone,
                'first-name': firstName,
                'last-name': lastName,
                country: countries[(country || 'US')]
            });
        } else {
            res.status(400).json({ details: ['Failed to update user information'] });
        }
    } else {
        res.status(200).json({
            "error": "Invalid input",
            "details": errors
        })
    }



};

