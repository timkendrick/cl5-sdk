# CL5 SVG file format

The SVG parser constructs the animation frames from source SVGs by assigning special meaning to various elements within the SVG, as defined by the element's `id` attribute.

## Example SVG file

The following SVG represents a valid CL5 animation:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg width="300px" height="300px" viewBox="0 0 300 300" version="1.1" xmlns="http://www.w3.org/2000/svg">
	<g id="stage:150,150">
		<g id="hello-60">
			<rect x="10" y="10" width="100" height="100"/>
			<circle id="background" cx="60" cy="60" r="50"/>
			<circle id="background:20" cx="60" cy="60" r="375"/>
			<circle id="background:25" cx="60" cy="60" r="350"/>
			<g id="content[animatein:30]">
				<path d="M 100 100 L 300 100 L 200 300 z" fill="orange" stroke="black" stroke-width="3"/>
				<rect x="150" y="250" width="100" height="100"/>
			</g>
		</g>
		<g id="goodbye-60">
			<g id="content[animatein:30][animateout:-30:30]">
				<rect x="10" y="10" width="100" height="100"/>
				<circle cx="100" cy="100" r="50"/>
			</g>
		</g>
    </g>
</svg>
```

See below for a description of the key elements within this SVG.

### The stage element

```xml
<g id="stage:150,150"></g>
```

The SVG file must contain a "stage" element at the root level, as seen in the example above. All elements outside the stage element will be excluded from the output animation. The `id` attribute of the stage element also defines the viewport origin for the animation: e.g. a stage element with an `id` of `stage:150,150` will be centered around the (150, 150) point in the SVG file.

### Scene elements

```xml
<g id="hello-60"></g>
```

Within the stage element is a series of "scene" elements. Scenes have a duration, and will be shown one after the other in the resulting animation. Scene element ids must end with a `-` followed by an integer specifying the scene duration, in frames: e.g. a scene element with an id of `hello-60` will last for 60 frames. Scene elements must be direct children of the stage element.

### Path elements

```xml
<rect x="10" y="10" width="100" height="100"/>
```

```xml
<circle id="background" cx="60" cy="60" r="50"/>
```

```xml
<path d="M 100 100 L 300 100 L 200 300 z" fill="orange" stroke="black" stroke-width="3" />
```

SVG paths contained within the scene elements are rendered as vector shapes in the output animation. Paths may be nested within `<g>` elements and will render as expected. If the path specifies an `id` attribute, it can be used as the target for a keyframe-based animation.

### Keyframe elements

```xml
<circle id="background:20" cx="60" cy="60" r="375"/>
<circle id="background:25" cx="60" cy="60" r="350"/>
```

Keyframe elements define updated states for the target element that is referenced in their `id` attribute. Keyframe element ids consist of the target element id, followed by `:`, followed by the index at which the keyframe is to be inserted. Target elements must be direct siblings of the keyframe elements, and the keyframe shape path must contain the same number of points as the target shape path.

### Effect group elements

```xml
<g id="content[animatein:30]">
	<path d="M 100 100 L 300 100 L 200 300 z" fill="orange" stroke="black" stroke-width="3"/>
	<rect x="150" y="250" width="100" height="100"/>
</g>
<g id="content[animatein:30][animateout:-30:30]">
	<rect x="10" y="10" width="100" height="100"/>
	<circle cx="100" cy="100" r="50"/>
</g>
```

Effect groups define animation effects that will be applied to any path elements within the effect group. Effect group ids consist of an identifier for the group, followed by one or more effect definitions. Effect definitions can take either of the following formats:

```
[effectname:duration]
[effectname:offset:duration]
```

...where `duration` is the length of the effect in frames, `offset` is the number of frames into the scene at which to start of the effect (or the number of frames from the end of the scene if `offset` is negative), and `effectname` is one of the following effect names:

- `"fadein"` – Fade the group up to 100% opacity
- `"fadeout"` – Fade the group down to 100% opacity
- `"animatein"` – Zoom the group into shot
- `"animateout"` – Zoom the group out of shot
- `"explode"` – Zoom the group into shot using a 'warp' distortion effect
- `"implode"` – Zoom the group out of shot using a 'warp' distortion effect
- `"pulse"` – Add a "pulse" animation to the group
- `"pop"` – Add a "bubble pop" animation to the group
- `"judder"` – Make the group quiver repeatedly
- `"jitter"` – Make the group shake uncontrollably
