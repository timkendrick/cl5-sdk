# CL5 Animation file format

Example animation file:

```json
{
	"type": "svg",
	"options": {
		"source": "./scenes/*.svg"
	},
	"text": [
		{
			"time": 0,
			"text": "Hello, world",
			"position": { "x": -150, "y": 30 },
			"style": {
				"color": "Fuchsia"
			},
			"effects": [
				{
					"name": "fadein",
					"offset": null,
					"duration": 30
				}
			]
		},
		{
			"time": 60,
			"text": "Goodbye, world",
			"position": { "x": -150, "y": 60 },
			"style": {
				"color": "rgb(0,0,0)"
			},
			"effects": [
				{
					"name": "fadeout",
					"offset": -30,
					"duration": 30
				}
			]
		}
	]
}
```

CL5 animation files in general are expected to take the following format:

```json
{
	"type": "{ParserType}",
	"options": {ParserOptions},
	"text": [
		{TextFrame},
		{TextFrame},
		{TextFrame}
	]
}
```

...where `{ParserType}` is a valid animation parser identifier, `{ParserOptions}` is an object that is passed to the parser, and `{TextFrame}` objects define the text that accompanies the animation.

-

### Parser types

The following parsers can be used as the `type` field of an animation file:

- `"svg"` – create an animation based on the contents of one or more SVG files
- ...more parsers coming soon

#### `svg` parser

Example SVG animation:

```json
{
	"type": "svg",
	"options": {
		"source": "./scenes/*.svg"
	},
	"text": []
}
```

The `svg` parser takes the following options:

| Name | Type | Required | Default | Description |
| ---- | ---- | -------- | ------- | ----------- |
| `source` | `string` | Yes | N/A | Glob specifying SVG file(s) to parse (see the [SVG animation reference](svg-file-format.md) on how to construct a valid SVG file) |

-

### Text frame objects

Example text frame object:

```json
{
	"time": 0,
	"text": "Hello, world",
	"position": { "x": -150, "y": 30 },
	"style": {
		"color": "Fuchsia"
	},
	"effects": [
		{
			"name": "fadein",
			"offset": null,
			"duration": 30
		}
	]
}
```

Text frame objects can specify the following fields:

| Name | Type | Required | Default | Description |
| ---- | ---- | -------- | ------- | ----------- |
| `time` | `number` | Yes | N/A | Frame offset for the text frame |
| `text` | `string` | No | `""` | Text to display for this frame |
| `position` | `object` | No | [Default position] | Text position coordinates |
| `position.x` | `number` | No | [Default position] | Text position x coordinate, relative to screen center |
| `position.y` | `number` | No | [Default position] | Text position y coordinate, relative to screen center |
| `style` | `object` | No | `null` | Text styling options |
| `style.text-align` | `string` | No | [Default alignment] | Text alignment |
| `style.font-family` | `string` | No | [Default font] | Font face |
| `style.font-size` | `string` | No | [Default font size] | Font size |
| `style.font-weight` | `string` | No | [Default font weight] | Font size |
| `style.color` | `string` | No | [Default text color] | Text color |
| `effects` | `TextEffect[]` | No | `null` | Text effects |

### Text effect objects

Example text effect object:

```json
{
	"name": "fadein",
	"offset": 10,
	"duration": 30,
	"options": null
}
```

Text effect objects can specify the following fields:

| Name | Type | Required | Default | Description |
| ---- | ---- | -------- | ------- | ----------- |
| `name` | `string` | Yes | N/A | Valid text effect identifier |
| `offset` | `number` | No | `0` | Number of frames to offset the effect start
| `duration` | `number` | No | [Text frame duration minus `offset`] | Length of the animation |(negative numbers work backwards from the end of the text frame) |
| `options` | `object` | No | `null` | Options to pass to the text effect |

-

### Text effects

The following effects can be used in the `effects` field of a text frame:

- `"animatein"` – move the text into position
- `"animateout"` – move the text away from its position
- `"fadein"` – fade the text up to 100% opacity
- `"fadeout"` – fade the text down to 0% opacity
- `"typewriter"` – animate the text in, letter-by-letter
- `"cursor"` – append a blinking cursor to the text

Multiple text effects can be applied to a single text frame. The effects will be applied in the order they are defined in the `effects` array.

#### `animatein` text effect

Example `animatein` text effect:

```json
{
	"name": "animatein",
	"offset": 10,
	"duration": 30,
	"options": {
		"position": {
			"x": 100,
			"y": 100
		}
	}
}
```

The `animatein` text effect takes the following options:

| Name | Type | Required | Default | Description |
| ---- | ---- | -------- | ------- | ----------- |
| `position` | `object` | Yes | N/A | Object specifying text start position, relative to animation center |
| `position.x` | `number` | Yes | N/A | X coordinate of text start position |
| `position.y` | `number` | Yes | N/A | Y coordinate of text start position |

#### `animateout` text effect

Example `animateout` text effect:

```json
{
	"name": "animateout",
	"offset": -30,
	"duration": 30,
	"options": {
		"position": {
			"x": 100,
			"y": 100
		}
	}
}
```

The `animatein` text effect takes the following options:

| Name | Type | Required | Default | Description |
| ---- | ---- | -------- | ------- | ----------- |
| `position` | `object` | Yes | N/A | Object specifying text end position, relative to animation center |
| `position.x` | `number` | Yes | N/A | X coordinate of text end position |
| `position.y` | `number` | Yes | N/A | Y coordinate of text end position |

#### `fadein` text effect

Example `fadein` text effect:

```json
{
	"name": "fadein",
	"offset": 10,
	"duration": 30,
	"options": null
}
```

The `fadein` text effect takes no additional options.

#### `fadeout` text effect

Example `fadeout` text effect:

```json
{
	"name": "fadeout",
	"offset": 10,
	"duration": 30,
	"options": null
}
```

The `fadeout` text effect takes no additional options.

#### `typewriter` text effect

Example `typewriter` text effect:

```json
{
	"name": "typewriter",
	"offset": 10,
	"duration": 30,
	"options": null
}
```

The `typewriter` text effect takes no additional options.

#### `cursor` text effect

Example `cursor` text effect:

```json
{
	"name": "cursor",
	"offset": 10,
	"duration": 30,
	"options": {
		"cursor": "█",
		"blinkDuration": 12
	}
}
```

The `cursor` text effect takes the following options:

| Name | Type | Required | Default | Description |
| ---- | ---- | -------- | ------- | ----------- |
| `cursor` | `string` | No | `"│"` | Cursor character to append to text |
| `blinkDuration` | `number` | No | 15 | Duration of the on/off cursor blink cycle |
