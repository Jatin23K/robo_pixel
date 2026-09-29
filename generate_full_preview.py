from PIL import Image, ImageDraw, ImageFont
import os

body_path = r'c:\Users\Jatin\Desktop\robo\pixel-pet-main\public\sprites\dark_body_idle_1.png'
sprites_dir = r'c:\Users\Jatin\Desktop\robo\pixel-pet-main\public\sprites'
names = ['neutral', 'happy', 'focused', 'angry', 'confused', 'sleepy', 'glitch', 'surprised']

body = Image.open(body_path).convert('RGBA')

# Create a 4x2 grid of 512x512 thumbnails
cell_size = 512
canvas = Image.new('RGBA', (cell_size * 4, cell_size * 2), (18, 22, 30, 255))
draw = ImageDraw.Draw(canvas)

for idx, name in enumerate(names):
    col = idx % 4
    row = idx // 4
    
    face_path = os.path.join(sprites_dir, f'dark_face_{name}.png')
    if os.path.exists(face_path):
        face = Image.open(face_path).convert('RGBA')
        comp = Image.alpha_composite(body, face)
        thumb = comp.resize((cell_size - 40, cell_size - 40), Image.NEAREST)
        
        px = col * cell_size + 20
        py = row * cell_size + 20
        canvas.paste(thumb, (px, py), thumb)
        
        # Draw label
        draw.text((px + 20, py + cell_size - 55), name.upper(), fill=(0, 255, 230, 255))

out_preview = r'c:\Users\Jatin\Desktop\robo\pixel-pet-main\robo_preview_all.png'
canvas.save(out_preview)
print(f'Full preview generated at: {out_preview}')
