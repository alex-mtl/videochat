CREATE TABLE users (
                       id INT AUTO_INCREMENT PRIMARY KEY,
                       email VARCHAR(255) UNIQUE,
                       password_hash VARCHAR(255),
                       google_id VARCHAR(255),
                       facebook_id VARCHAR(255),
                       telegram_id VARCHAR(255),
                       username VARCHAR(255),
                       avatar_url VARCHAR(255),
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
