const fs = require('fs');
const path = require('path');

const directoryPath = 'rooms';

// Get the current time in milliseconds
const currentTime = Date.now();

// Function to remove files modified more than 60 minutes ago
function removeOldFiles(directoryPath) {
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            return;
        }

        files.forEach(file => {
            const filePath = path.join(directoryPath, file);

            // Get file information
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error('Error getting file stats:', err);
                    return;
                }

                // Calculate the time difference between current time and last modified time
                const timeDifference = currentTime - stats.mtime.getTime();
                const minutesDifference = timeDifference / (1000 * 60); // Convert milliseconds to minutes

                // Check if the file was modified more than 60 minutes ago
                if (minutesDifference > 60) {
                    // Remove the file
                    fs.unlink(filePath, err => {
                        if (err) {
                            console.error('Error deleting file:', err);
                            return;
                        }
                        console.log(`Deleted file: ${filePath}`);
                    });
                }
            });
        });
    });
}

// Call the function to remove old files
removeOldFiles(directoryPath);
