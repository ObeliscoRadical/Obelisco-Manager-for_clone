"""Gera ícones Obelisco Radical no estilo CEO AI (3D dourado polido + halo verde-amarelo)."""
import asyncio, os, base64, sys, urllib.request
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv('/app/backend/.env')
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT_DIR = "/app/frontend/public/icons"
REF_URL = "https://static.prod-images.emergentagent.com/jobs/8f3aae9f-2e41-4eb4-b9df-9130004de5e7/images/ac96baa1fe90c79f1a5621805c7b54e6d0689a4cbe89b8e95ab86eb0c127fefb.jpeg"

# Download reference image
REF_PATH = "/tmp/ceo_ai_ref.jpg"
if not os.path.exists(REF_PATH):
    urllib.request.urlretrieve(REF_URL, REF_PATH)
with open(REF_PATH, "rb") as f:
    REF_B64 = base64.b64encode(f.read()).decode()

STYLE_LOCK = """MATCH THE EXACT STYLE OF THE REFERENCE IMAGE PROVIDED:
- 3D polished metallic GOLD material with realistic sheen and specular highlights (rich warm gold #DAA520 to #B8860B with #FFFACD highlights)
- Bright luminous halo/aura in vibrant GREEN-YELLOW / lime-green (#ADFF2F to #90EE90) glowing FROM BEHIND the object
- Dark almost-black textured background (#1A1A1A to #2C2C2C) with very subtle grain
- Object centered, floats slightly above the surface
- iOS-style rounded corners on the outer icon frame
- Cinematic realistic lighting from above-left, soft ambient occlusion, subtle rim light
- Object should look like polished ceramic / liquid metal, NOT flat vector
- Same premium mysterious "AI-tech-luxury" vibe as reference
- ABSOLUTELY NO TEXT anywhere in the image"""

CONCEPTS = [
    {
        "id": "ceostyle_01_letter_O",
        "prompt": f"""Design an app icon 1024x1024. Main subject: a single stylised uppercase letter "O" in 3D — same 3D polished treatment as the reference. The letter O is the initial of "Obelisco".

{STYLE_LOCK}

The letter O should be BOLD, thick, with smooth curved cross-section (like a metallic donut/ring), highly polished gold with detailed specular highlights. Green-yellow halo behind. Nothing else in the image besides the O.""",
    },
    {
        "id": "ceostyle_02_letter_OR_monogram",
        "prompt": f"""Design an app icon 1024x1024. Main subject: a stylish 3D monogram combining the letters "O" and "R" (for Obelisco Radical) — the O and R interlock elegantly, both in the same 3D polished gold as the reference.

{STYLE_LOCK}

The monogram is centered, thick and premium (like a luxury brand emblem). Green-yellow glow radiates behind it. No text, only the O+R monogram sculpture.""",
    },
    {
        "id": "ceostyle_03_electric_plug",
        "prompt": f"""Design an app icon 1024x1024. Main subject: a 3D polished European electric plug (Type F, two round prongs pointing UP) — rendered in the exact same 3D polished metallic gold style as the reference letter C.

{STYLE_LOCK}

The plug is chunky, sculpted, luxurious, floating in the center. The green-yellow halo radiates behind it (like electric energy). Absolutely no text.""",
    },
    {
        "id": "ceostyle_04_lightning_bolt",
        "prompt": f"""Design an app icon 1024x1024. Main subject: a bold 3D lightning bolt (Z-shape, angular, sharp) rendered in the exact same 3D polished metallic gold style as the reference letter C.

{STYLE_LOCK}

The bolt is thick, sculpted, catches strong light on its facets. Green-yellow halo behind. Centered. No text.""",
    },
    {
        "id": "ceostyle_05_O_with_bolt_inside",
        "prompt": f"""Design an app icon 1024x1024. Main subject: a 3D polished gold letter "O" (thick metallic ring) with a 3D lightning bolt piercing horizontally through the middle of the O — both elements share the same 3D polished gold treatment as the reference letter C.

{STYLE_LOCK}

Composition: the O is the main frame, the lightning bolt cuts across its interior. Both objects float together, sharing highlights. Green-yellow halo behind. Absolutely no text, just the O + bolt sculpture.""",
    },
]

async def gen(concept):
    print(f"[+] {concept['id']}")
    chat = LlmChat(api_key=API_KEY, session_id=f"obelisco-ceo-style-{concept['id']}",
                   system_message="You are a top-tier premium app icon designer specialising in luxury 3D rendered icons."
                   ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    try:
        text, images = await chat.send_message_multimodal_response(
            UserMessage(text=concept["prompt"], file_contents=[ImageContent(REF_B64)])
        )
        if not images:
            print(f"  ✗ NO IMAGES. Text: {text[:150]}")
            return
        for i, img in enumerate(images):
            fn = f"{OUT_DIR}/{concept['id']}_{i}.png"
            with open(fn, "wb") as f:
                f.write(base64.b64decode(img["data"]))
            print(f"  ✓ {fn}")
    except Exception as e:
        print(f"  ✗ ERR: {e}")

async def main():
    if not API_KEY:
        sys.exit("no key")
    await asyncio.gather(*(gen(c) for c in CONCEPTS))

if __name__ == "__main__":
    asyncio.run(main())
