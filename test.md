# Personal Portfolio

- **Technologies**: Three.js, TypeScript, WebGL

My portfolio website uses vanilla TypeScript, Three.js for 3D, and Vite for frontend tooling. 

For the complex models used in my website, I learned Blender for the first time. I would have rather used Autodesk Inventor or Solidworks, but I didn't have the licenses for those anymore. 

The design language for the website is intentionally minimal, with the purpose to emphasize the interaction with 3D models. UI text is given artificial subpixel colour fringing, and has font-smoothing disabled, to replicate the kind of text seen on old Windows machines from the mid to early 2000s.

### Overview

The website can be broken down into multiple pages, each corresponding to a 3D object. The "Home" page is the default page viewable when loading into the website, and provides an orbiting view of all objects I have currently built. As of this moment, there are 3 completed pages, the turntable, portfolio, and contact (business card). 

All pages share the same three.js scene, and pages are differentiated by page-specific camera positions, model visibility, and DOM configurations. 


### Turntable
The turntable model in my website is a conceptual hidden belt-drive turntable. Realistically this would be a nightmare for maintenance if it existed in real life, but for a website it's no issue. I was drawn to the appearance of the turntable platter and flywheel being flush with the chassis of the turntable. 

### Design
When sketching and drafting the design for the turntable, I decided to pursure a more minimal route, as they were easier to model, and I am fond of minimal, functional design. Some of my inspirations in the design include the Bang & Olufsen Beogram 6000, Pro-Ject turntables, Teenage Engineering TP-7, and modern Apple devices. The start-stop button for example was inspired from those found on Technics turntables. The cartridge design was inspired from geometric Ortofon cartridges.

### Function
All "songs" in the library are sourced from YouTube, and the player is implemented using YouTube iframe API. Song covers, release, and genre metadata are fetched using a script that first parses the YouTube video name to extract artist and song name. This is then parsed into a script that queries MusicBrainz, and CoverArtArchive, allowing for accurate metadata and cover art for the records, even when the YouTube video itself has none of that metadata. The cover art can be selected manually by the user, as there could be many versions of individual releases.

### Behaviour
For the turntable page in my website, I didn't want it to be a simple music player. Spotify and Apple music already exist and are better suited for those. Instead, I wanted to provide a more interactive and immersive experience. For the music selection process, users must browse a list of records, "open" the record, then physically move the vinyl onto the turntable platter. To play the record, users also must press the start button of the turntable, then drag the tonearm onto the edge of the vinyl before the needle can be dropped. The tonearm's position on the vinyl changes based on the completion of the song, like a real record. This allows for the song to be scrubbed by dragging the tonearm. When the needle is dropped and the song plays, the tonearm starts bobbing, and slight warp and wobble on the vinyl record itself is visible. Realism is something I heavily prioritized and pursued in my design of the experience. This is why UI elements such as the player timeline can't be scrubbed with the mouse. I wanted all the interaction to be with the 3D model. One may bring up how vinyl records shouldn't have video, but when using the YouTube iframe as medium for the player it would be a waste to hide it, and if the song is a music video, the experience could be heightened, which is why I implemented a fullscreen mode for the player.


## Embedded Video Section

Below is the spot where, in the live version, a **video or GIF** is rendered into the document itself. When this markdown is converted to HTML and drawn to a canvas, the video frame is composited into the same space.

![Video Placeholder](https://via.placeholder.com/1280x720.png?text=Video+Playback+Area)
**3D Portfolio · Turntable Interaction**
*Live demo: dragging vinyl from a 2D cover into a 3D turntable, with auto-return logic.*

In the Three.js implementation, this block becomes a rectangle where a `<video>` element is drawn into the canvas each frame.

---

## Layout Example · Text Beside Image

### Scrollable Document Texture

- Long-form markdown content is rendered to a tall canvas.
- A second canvas, matching the paper aspect ratio, acts as the viewport.
- Scrolling updates the Y offset used when copying from the full canvas into the viewport.

This design keeps the 3D mesh resolution and aspect consistent, while allowing arbitrary document length. You can think of it as a camera panning over a tall mural, but the visible frame is fixed to the paper size.

![Diagram of scrollable canvas to paper mapping](scroll-diagram.png)
*Diagram: full document canvas on the left, viewport slice on the right, mapped onto the paper mesh.*

---

## Technical Notes

### Rendering Pipeline

1.  **Markdown → HTML**
    Content is written in markdown (this file) and converted to HTML at build time.

2.  **HTML → Content Canvas**
    HTML is laid out in a tall, offscreen canvas (`contentCanvas`).

3.  **Scroll Window**
    A viewport canvas (`viewCanvas`) copies a slice of the tall canvas, based on a `scrollY` value.

4.  **CanvasTexture → Mesh**
    `viewCanvas` becomes a `THREE.CanvasTexture` applied to the paper mesh.

### Embedded Motion

- A `<video>` element is synced with the render loop.
- Each frame, the current video frame is drawn into a defined rect in `contentCanvas`.
- When the scroll window passes over that rect, the video appears “inside” the paper.

---

## Implementation Summary

- Authoring happens in a single markdown document (like this one).
- Layout is continuous, without page breaks.
- Images, headings, and callouts are all styled via CSS.
- Specific regions (like the “Embedded Video Section”) are reserved as live zones where video frames or animated content are composited.



---

*Notes:*
*   *Replace `paper-mockup.png` and `scroll-diagram.png` with real paths.*
*   *In the 3D implementation, the “video block” area is where you draw the video frame into the canvas.*