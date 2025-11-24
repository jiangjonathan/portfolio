#!/bin/bash

# Process each AdobeStock image
for file in AdobeStock_1183631360.jpeg AdobeStock_593176534.png AdobeStock_717965343.jpeg; do
    if [ -f "$file" ]; then
        output="${file%.*}_overlay.png"
        echo "Processing $file -> $output"
        
        # Convert to PNG with luminance controlling transparency
        # Dark areas (low luminance) become transparent, bright areas stay opaque
        magick "$file" \
            \( +clone -colorspace Gray -negate \) \
            -compose CopyOpacity -composite \
            -resize 500x500 \
            "$output"
        
        if [ $? -eq 0 ]; then
            echo "✓ Completed: $output"
        else
            echo "✗ Failed: $output"
        fi
    fi
done

echo "Done!"
