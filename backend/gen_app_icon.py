"""Gera 4 conceitos de app icon para Obelisco Radical usando Gemini Nano Banana."""
import asyncio
import os
import base64
import sys
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv('/app/backend/.env')
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT_DIR = "/app/frontend/public/icons"

CONCEPTS = [
    {
        "id": "01_plug_lightning",
        "prompt": """Design a premium modern app icon for 'Obelisco Radical', an electrical & telecommunications company from Lisbon Portugal. The icon is a square 1024x1024 with rounded corners (iOS style).
COMPOSITION: Dark almost-black background with subtle radial gradient. Center: a stylized European Type-F electric plug (two rounded prongs pointing UP) rendered in polished metallic gold with realistic reflections. The plug's body morphs into a bold lightning bolt shape at its base — a sharp, angular yellow-gold lightning bolt with an electric glow. Emanating from the prongs: subtle radiant electric arcs in bright yellow. 
STYLE: Bold, iconic, luxurious. Metallic gold (#F4C542 to #FBBF24) contrasted against deep matte black (#0a0a0a). Slight cinematic glow. NO TEXT AT ALL. Vector-clean silhouette that reads well at small sizes. Symmetrical composition. Premium fintech-like polish.""",
    },
    {
        "id": "02_obelisk_bolt",
        "prompt": """Design an ultra-innovative app icon for 'Obelisco Radical', a Lisbon-based electrical company. The icon is a square 1024x1024 with rounded corners (iOS-style).
COMPOSITION: A vertical ancient Egyptian OBELISK (tall pyramid-tipped monolith) standing at the center, but the obelisk itself is made of pure crystalline electric energy — glowing yellow-gold lightning trapped inside a black obsidian frame. A lightning bolt slashes DIAGONALLY across the obelisk creating a dramatic split. Two golden electric plug prongs emerge from the top like antenna/lightning rod.
STYLE: Cyberpunk meets ancient monument. Dark background (#0a0a0a to #1a1a1a radial). Rich metallic gold accents (#FBBF24), electric neon amber glow, subtle particle sparks. Highly detailed but readable. NO TEXT. Feels 'radical', bold and mystical.""",
    },
    {
        "id": "03_letter_o_socket",
        "prompt": """Create a highly innovative minimalist app icon for 'Obelisco Radical' (electrical company). Square 1024x1024 with rounded corners (iOS-style).
COMPOSITION: A BIG bold letter 'O' takes the entire icon — but the letter O IS actually a European electric wall socket (tomada) with two round holes. Inside each of the two round holes: golden light glows brightly like electricity is flowing. A single sharp lightning bolt in vivid gold cuts across the O horizontally, connecting the two socket holes as if they are charged. The O has a slight metallic gold outer ring with reflections.
STYLE: Minimalist but rich, tech-brand quality (think Apple/Google icons). Very bold recognisable silhouette. Dark almost-black background with subtle glow. Metallic gold (#FBBF24) on black (#0a0a0a). Absolutely NO TEXT — just the O shape and lightning. Instantly recognisable at 60x60px.""",
    },
    {
        "id": "04_shield_energy",
        "prompt": """Design a premium heraldic app icon for 'Obelisco Radical' electrical & telecom company. Square 1024x1024 rounded corners iOS-style.
COMPOSITION: A modern shield/crest silhouette at the center in solid metallic gold, sharp geometric edges (not rounded). Inside the shield: a stylised power plug integrated with an aggressive lightning bolt forming a single elegant emblem — the two round prongs of a European plug become the two glowing 'eyes' at the top of the shield, and a fierce lightning bolt runs down the middle. The shield has subtle golden filigree on its edges.
STYLE: Bold, badge-like, premium industrial. Very high contrast: rich metallic gold with orange highlights (#FBBF24, #F59E0B) against a pure black background (#000000). Slight lighting from above-left. NO TEXT AT ALL. Think Rolex badge meets modern electrical icon. Very memorable silhouette.""",
    },
]

async def generate(concept):
    print(f"\n[+] Generating {concept['id']}...")
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"obelisco-icon-{concept['id']}",
        system_message="You are an expert brand designer creating premium mobile app icons.",
    ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    
    try:
        text, images = await chat.send_message_multimodal_response(UserMessage(text=concept["prompt"]))
        if not images:
            print(f"  ✗ NO IMAGES for {concept['id']}. Text: {text[:200]}")
            return None
        # Guardar todas as imagens devolvidas
        paths = []
        for i, img in enumerate(images):
            fn = f"{OUT_DIR}/icon_{concept['id']}_{i}.png"
            with open(fn, "wb") as f:
                f.write(base64.b64decode(img["data"]))
            paths.append(fn)
            print(f"  ✓ Saved {fn}")
        return paths
    except Exception as e:
        print(f"  ✗ ERROR {concept['id']}: {e}")
        return None

async def main():
    if not API_KEY:
        print("ERR: EMERGENT_LLM_KEY not found")
        sys.exit(1)
    results = await asyncio.gather(*(generate(c) for c in CONCEPTS))
    ok = sum(1 for r in results if r)
    print(f"\n=== Done: {ok}/{len(CONCEPTS)} concepts generated ===")

if __name__ == "__main__":
    asyncio.run(main())
