# Studio Varaždin · Print Studio & Vector Lab

Web application for T-shirt print preparation:
- **Step 1:** AI Background Isolation & 2K/4K Upscaling (Nano Banana Pro / Nano Banana 2 / GPT Image 2.5)
- **Step 2:** DTF Alpha Channel Extraction, Choke, Feathering & Defringing
- **Step 3:** Ming-Image Layer Segmentation & Multi-Layer Adobe Photoshop (`.psd`) Export
- **Step 4:** Sub-Pixel Multi-Plate SVG Vectorization (`potrace` + `resvg`)
- **Step 5:** Apparel Garment Mockup & Production ZIP Bundle Export

---

## Quick Start on a New Mac

### 1. Clone the repository
```bash
git clone https://github.com/timon2200/studio-print-lab.git
cd studio-print-lab
```

### 2. Receive `Print_Lab_Assets_Pack` (via AirDrop or External SSD)
You can place the `Print_Lab_Assets_Pack` folder in **any** of these locations (the app detects all of them automatically):
- Inside this `studio-print-lab/` folder (`./Print_Lab_Assets_Pack`)
- In `~/Downloads/Print_Lab_Assets_Pack` (default AirDrop destination)
- On `~/Desktop/Print_Lab_Assets_Pack`
- Directly on a plugged-in external SSD (`/Volumes/<YourSSD>/Print_Lab_Assets_Pack`)

*(Note: `Print_Lab_Assets_Pack` already includes `.env` with the API keys, all 408 high-res master designs, 408 WebP catalog previews, and existing generated outputs. If you received `.env` separately via AirDrop/message, drop it into this `studio-print-lab/` root folder.)*

### 3. Run the one-time setup
```bash
bash setup_mac.sh
```

### 4. Launch Print Studio & Vector Lab
Either **double-click `Start_Print_Lab.command`** in Finder, or run:
```bash
./.venv/bin/python run_print_lab.py
```
Then open **[http://localhost:8000](http://localhost:8000)** in your browser.
