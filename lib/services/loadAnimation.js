'use strict';

const path = require('path');
const flatten = require('lodash.flatten');
const range = require('lodash.range');
const parseColor = require('color-parser');
const randomSeed = require('random-seed');

const randomGenerator = randomSeed(0);
const random = randomGenerator.floatBetween.bind(randomGenerator, 0, 1);

const SvgParser = require('../parsers/svg');

module.exports = function(animation, animationPath) {
	const textFrames = renderAnimationText(animation.text);
	return loadAnimationGraphics(animation, animationPath)
		.then(shapes => {
			return {
				shapes: shapes,
				text: textFrames
			};
		});


	function loadAnimationGraphics(animation, animationPath) {
		return parseAnimationGraphics(animation, animationPath)
			.then(shapes => {
				const MAX_DECIMAL_PLACES = 2;
				return getRoundedShapes(shapes, MAX_DECIMAL_PLACES);
			});


		function parseAnimationGraphics(animation, animationPath) {
			const parserOptions = animation.options || null;
			const animationType = animation.type;
			const cwd = path.dirname(animationPath);
			switch (animationType) {
				case 'svg':
					return new SvgParser().parse(parserOptions, cwd);
				default:
					throw new Error('Invalid animation type: ' + animationType);
			}
		}

		function getRoundedShapes(shapes, maxDecimalPlaces) {
			return shapes.map(shape => Object.assign({}, shape, {
				path: shape.path.map(segment => getRoundedSegment(segment, maxDecimalPlaces)),
				keyframes: shape.keyframes.map(keyframe => {
					return Object.assign({}, keyframe, {
						properties: (keyframe.properties.path ? Object.assign({}, keyframe.properties, {
							path: keyframe.properties.path.map(segment => getRoundedSegment(segment, maxDecimalPlaces))
						}) : keyframe.properties)
					});
				})
			}));


			function getRoundedSegment(segment, maxDecimalPlaces) {
				return {
					point: getRoundedPoint(segment.point, maxDecimalPlaces),
					handleIn: getRoundedPoint(segment.handleIn, maxDecimalPlaces),
					handleOut: getRoundedPoint(segment.handleOut, maxDecimalPlaces)
				};
			}
		}
	}

	function renderAnimationText(textFrames) {
		const sortedFrames = textFrames.slice().sort((a, b) => a.time - b.time);
		const frameOffsets = sortedFrames.reduce((offsets, textFrame, index, array) => {
			const previousFrame = array[index - 1];
			const previousFrameOffset = (index === 0 ? 0 : offsets[index - 1]);
			const previousFrameDuration = (index === 0 ? 0 : previousFrame.duration);
			const frameOffset = previousFrameOffset + previousFrameDuration;
			return offsets.concat(frameOffset);
		}, []);
		const effectFrames = flatten(sortedFrames.map((textFrame, index) => {
			const frameDuration = textFrame.duration;
			const processedFrames = getTextEffectFrames(textFrame, frameDuration);
			const frameOffset = frameOffsets[index];
			return processedFrames.map(
				effectFrame => Object.assign({}, effectFrame, {
					time: frameOffset + effectFrame.time
				})
			);
		}));
		return effectFrames;


		function getTextEffectFrames(textFrame, frameDuration) {
			const initialFrame = {
				time: 0,
				text: textFrame.text,
				style: textFrame.style,
				position: textFrame.position
			};
			const frameEffects = textFrame.effects || [];
			return frameEffects.reduce((inputFrames, effect) => {
				const effectOffset = Math.max(0, (effect.offset ? (effect.offset < 0 ? frameDuration + effect.offset : effect.offset) : 0));
				const effectDuration = Math.min(frameDuration - effectOffset, effect.duration || (frameDuration - effectOffset));
				const unprocessedEffectFrames = getTextFramesSlice(inputFrames, effectOffset, effectDuration);
				const effectFrames = processTextEffects(unprocessedEffectFrames, effect, effectOffset, effectDuration);
				const beforeFrames = (effectOffset === 0 ? [] : getTextFramesSlice(inputFrames, 0, effectOffset));
				const afterFrames = (effectOffset + effectDuration === frameDuration ? [] : getTextFramesSlice(inputFrames, effectOffset + effectDuration, frameDuration - (effectOffset + effectDuration)));
				return beforeFrames.concat(effectFrames).concat(afterFrames);
			}, [initialFrame]);
		}

		function processTextEffects(inputFrames, effect, effectOffset, effectDuration) {
			const effectName = effect.name;
			const effectOptions = effect.options || null;
			switch (effectName) {
				case 'fadein':
					return fadeInEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				case 'fadeout':
					return fadeOutEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				case 'animatein':
					return animateInEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				case 'animateout':
					return animateOutEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				case 'typewriter':
					return typewriterEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				case 'cursor':
					return cursorEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				case 'prepend':
					return prependEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				case 'jitter':
					return jitterEffect(inputFrames, effectOffset, effectDuration, effectOptions);
				default:
					throw new Error('Invalid text effect: ' + effectName);
			}


			function animateInEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				return range(effectOffset, effectOffset + effectDuration).map(offset =>  {
					const positionOffset = effectOptions.offset;
					const activeFrame = getTextFrameAtOffset(inputFrames, offset);
					const framePosition = activeFrame.position || { x: 0, y: 0 };
					const progress = (offset - effectOffset) / effectDuration;
					return Object.assign({}, activeFrame, {
						time: offset,
						position: {
							x: framePosition.x + (1 - progress) * positionOffset.x,
							y: framePosition.y + (1 - progress) * positionOffset.y
						}
					});
				});
			}

			function animateOutEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				return range(effectOffset, effectOffset + effectDuration).map(offset =>  {
					const positionOffset = effectOptions.offset;
					const activeFrame = getTextFrameAtOffset(inputFrames, offset);
					const framePosition = activeFrame.position || { x: 0, y: 0 };
					const progress = (offset - effectOffset) / effectDuration;
					return Object.assign({}, activeFrame, {
						time: offset,
						position: {
							x: framePosition.x + progress * positionOffset.x,
							y: framePosition.y + progress * positionOffset.y
						}
					});
				});
			}

			function fadeInEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				return range(effectOffset, effectOffset + effectDuration).map(offset =>  {
					const activeFrame = getTextFrameAtOffset(inputFrames, offset);
					const frameStyle = activeFrame.style || {};
					const currentColor = frameStyle.color || 'rgb(0,0,0)';
					const opacity = (offset - effectOffset) / effectDuration;
					return Object.assign({}, activeFrame, {
						time: offset,
						style: Object.assign({}, frameStyle, {
							color: getAlphaColor(currentColor, opacity)
						})
					});
				});
			}

			function fadeOutEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				return range(effectOffset, effectOffset + effectDuration).map(offset =>  {
					const activeFrame = getTextFrameAtOffset(inputFrames, offset);
					const frameStyle = activeFrame.style || {};
					const currentColor = frameStyle.color || 'rgb(0,0,0)';
					const opacity = 1 - (offset - effectOffset) / effectDuration;
					return Object.assign({}, activeFrame, {
						time: offset,
						style: Object.assign({}, frameStyle, {
							color: getAlphaColor(currentColor, opacity)
						})
					});
				});
			}

			function typewriterEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				const framesWithDurations = getTextFramesWithDurations(inputFrames, effectDuration);
				return flatten(framesWithDurations.map(frameItem => {
					const frame = frameItem.frame;
					const frameDuration = frameItem.duration;
					const frameOffset = frame.time;
					const text = frame.text;
					return [''].concat(text.split('')).reduce((effectFrames, character, index, array) => {
						const numSteps = array.length;
						const progress = index / (numSteps - 1);
						const timeOffset = frameOffset + Math.round(progress * (frameDuration - 1));
						const sourceFrame = getTextFrameAtOffset(effectFrames, timeOffset);
						const updatedFrame = Object.assign({}, sourceFrame, {
							text: text.substr(0, index)
						});
						const splicedFrames = insertTextFrameAtOffset(effectFrames, updatedFrame, timeOffset);
						return splicedFrames;
					}, inputFrames);
				}));
			}

			function cursorEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				effectOptions = effectOptions || {};
				const DEFAULT_CURSOR = '&boxv;';
				const DEFAULT_CURSOR_BLINK_DURATION = 15;
				const blinkDuration = effectOptions.blinkDuration || DEFAULT_CURSOR_BLINK_DURATION;
				const cursorCharacter = effectOptions.cursor || DEFAULT_CURSOR;
				const framesWithDurations = getTextFramesWithDurations(inputFrames, effectDuration);
				const effectFrames = flatten(framesWithDurations.map(frameItem => {
					const frame = frameItem.frame;
					const frameDuration = frameItem.duration;
					const numBlinks = Math.floor((frameDuration - 1) / blinkDuration);
					return [
						getTextFrameWithCursor(frame, cursorCharacter)
					].concat(
						range(numBlinks).map((value, index) => {
							const blinkFrame = Object.assign({}, frame, {
								time: frame.time + (index + 1) * blinkDuration
							});
							const isCursorHidden = (index % 2 === 0);
							return (isCursorHidden ? blinkFrame : getTextFrameWithCursor(blinkFrame, cursorCharacter));
						})
					);
				}));
				return effectFrames;


				function getTextFrameWithCursor(frame, cursorCharacter) {
					return Object.assign({}, frame, {
						text: appendCursor(frame.text, cursorCharacter)
					});


					function appendCursor(string, cursorCharacter) {
						return string + cursorCharacter;
					}
				}
			}

			function prependEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				const textPrefix = effectOptions.text || '';
				return inputFrames.map(frame => {
					return Object.assign({}, frame, {
						text: textPrefix + (frame.text || '')
					});
				});
			}

			function jitterEffect(inputFrames, effectOffset, effectDuration, effectOptions) {
				const DEFAULT_TEXT_POSITION = { x: -266, y: 64 };
				const maxJitter = effectOptions.amount;
				const isIncreasing = Boolean(effectOptions.increasing);
				return range(effectOffset, effectOffset + effectDuration).map(offset =>  {
					const activeFrame = getTextFrameAtOffset(inputFrames, offset);
					const framePosition = activeFrame.position || DEFAULT_TEXT_POSITION;
					const t = (offset - effectOffset) / effectDuration;
					const jitterOffset = {
						x: (isIncreasing ? t : 1) * (-0.5 * maxJitter + random() * maxJitter),
						y: (isIncreasing ? t : 1) * (-0.5 * maxJitter + random() * maxJitter)
					};
					return Object.assign({}, activeFrame, {
						time: offset,
						position: Object.assign({}, framePosition, {
							x: framePosition.x + jitterOffset.x,
							y: framePosition.y + jitterOffset.y
						})
					});
				});
			}
		}

		function getTextFramesBeforeOffset(frames, offset) {
			return frames.filter(frame => (frame.time < offset));
		}

		function getTextFramesAfterOffset(frames, offset) {
			return frames.filter(frame => (frame.time > offset));
		}

		function getTextFrameAtOffset(frames, offset) {
			return frames.filter(frame => (frame.time <= offset)).pop() || frames[0];
		}

		function insertTextFrameAtOffset(frames, frame, offset) {
			const insertedFrame = Object.assign({}, frame, {
				time: offset
			});
			const beforeFrames = getTextFramesBeforeOffset(frames, offset);
			const afterFrames = getTextFramesAfterOffset(frames, offset);
			return beforeFrames.concat(insertedFrame).concat(afterFrames);
		}

		function getTextFramesSlice(frames, offset, duration) {
			const framesWithinRange = frames.filter(frame => (frame.time >= offset) && (frame.time < offset + duration));
			const isExactStartTimeMatch = ((framesWithinRange.length > 0) && (framesWithinRange[0].time === offset));
			if (isExactStartTimeMatch) { return framesWithinRange; }
			const previousFrame = getTextFrameAtOffset(frames, offset);
			const sliceStartFrame = Object.assign({}, previousFrame, {
				time: offset
			});
			return [sliceStartFrame].concat(framesWithinRange);
		}

		function getTextFramesWithDurations(frames, totalDuration) {
			return frames.map((frame, index, array) => {
				const frameOffset = frame.time;
				const isLastFrame = (index === array.length - 1);
				const nextFrame = (isLastFrame ? null : array[index + 1]);
				const nextFrameOffset = (nextFrame ? nextFrame.time : totalDuration);
				const frameDuration = nextFrameOffset - frameOffset;
				return {
					frame: frame,
					duration: frameDuration
				};
			});
		}

		function getAlphaColor(colorString, opacity) {
			const color = parseColor(colorString);
			const updatedColor = Object.assign({}, color, {
				a: color.a * opacity
			});
			return formatCssColor(updatedColor);


			function formatCssColor(color) {
				return 'rgba(' + [color.r, color.g, color.b, color.a].join(',') + ')';
			}
		}
	}

	function getRoundedPoint(point, maxDecimalPlaces) {
		return {
			x: getRoundedNumber(point.x, maxDecimalPlaces),
			y: getRoundedNumber(point.y, maxDecimalPlaces)
		};
	}

	function getRoundedNumber(number, maxDecimalPlaces) {
		const REGEXP_DECIMALS = /\.(\d+)$/;
		const hasDecimalPlaces = REGEXP_DECIMALS.test(number);
		if (!hasDecimalPlaces) { return number; }
		const numDecimalPlaces = REGEXP_DECIMALS.exec(number)[1].length;
		return (numDecimalPlaces > maxDecimalPlaces ? Number(number.toFixed(maxDecimalPlaces)) : number);
	}
};
