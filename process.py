import sys
import os
from PIL import Image

def process_sprite_sheet():
    img_path = r"c:\Users\Jatin\Desktop\robo\pixel-pet-main\robo design\ChatGPT Image Sep 21, 2026, 01_33_52 PM.png"
    out_path = r"c:\Users\Jatin\Desktop\robo\pixel-pet-main\public\spritesheet.png"
    
    img = Image.open(img_path).convert("RGBA")
    
    # Get bounding box of all non-transparent pixels
    bbox = img.getbbox()
    if not bbox:
        print("Image is entirely empty/transparent.")
        return
        
    # Crop to content
    img = img.crop(bbox)
    
    # We expect 4 robots horizontally. Let's find the vertical transparent gaps.
    pixels = img.load()
    width, height = img.size
    
    columns = []
    for x in range(width):
        is_transparent = True
        for y in range(height):
            if pixels[x, y][3] > 10: # not fully transparent
                is_transparent = False
                break
        columns.append(is_transparent)
        
    # Find contiguous blocks of non-transparent columns
    blocks = []
    in_block = False
    start_x = 0
    for x in range(width):
        if not columns[x] and not in_block:
            in_block = True
            start_x = x
        elif columns[x] and in_block:
            in_block = False
            blocks.append((start_x, x))
            
    if in_block:
        blocks.append((start_x, width))
        
    print(f"Found {len(blocks)} distinct sprite blocks.")
    
    if len(blocks) != 4:
        print("Warning: Expected exactly 4 poses. Found:", len(blocks))
        
    # Extract each sprite
    sprites = []
    max_h = 0
    max_w = 0
    
    for (start, end) in blocks:
        sprite = img.crop((start, 0, end, height))
        s_bbox = sprite.getbbox()
        if s_bbox:
            sprite = sprite.crop(s_bbox)
            sprites.append(sprite)
            if sprite.width > max_w: max_w = sprite.width
            if sprite.height > max_h: max_h = sprite.height
            
    # Scale them down so they fit in a standard game grid.
    # The original was likely 32x32 or 48x48 upscaled.
    # Let's target a 64x64 grid cell.
    GRID_SIZE = 64
    
    # Find the maximum ratio to scale down
    ratio = min(GRID_SIZE / max_w, (GRID_SIZE - 4) / max_h)
    
    final_sheet = Image.new("RGBA", (GRID_SIZE * len(sprites), GRID_SIZE), (0,0,0,0))
    
    for i, sprite in enumerate(sprites):
        new_w = int(sprite.width * ratio)
        new_h = int(sprite.height * ratio)
        # Use LANCZOS for downscaling to make it look decent, 
        # though NEAREST is better for pixel art if it was a perfect integer scale.
        # Since ChatGPT warped it, LANCZOS will at least keep it smooth.
        resized = sprite.resize((new_w, new_h), Image.LANCZOS)
        
        # Center horizontally, anchor to bottom
        x_offset = (GRID_SIZE * i) + (GRID_SIZE - new_w) // 2
        y_offset = GRID_SIZE - new_h # Anchor feet to bottom
        
        final_sheet.paste(resized, (x_offset, y_offset))
        
    final_sheet.save(out_path)
    print("Saved clean sprite sheet to:", out_path)

if __name__ == '__main__':
    process_sprite_sheet()
