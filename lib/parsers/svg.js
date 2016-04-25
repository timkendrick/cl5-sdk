'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const paper = require('paper');
const parseColor = require('color-parser');
const pify = require('pify');
const flatten = require('lodash.flatten');
const range = require('lodash.range');
const randomSeed = require('random-seed');

const randomGenerator = randomSeed(0);
const random = randomGenerator.floatBetween.bind(randomGenerator, 0, 1);

const expandGlob = pify(glob);
const readFile = pify(fs.readFile);

const STAGE_NAME_REGEXP = /^stage:(-?\d\.?\d*),(-?\d\.?\d*)$/;
const SCENE_NAME_REGEXP = /^(.*?)-(\d+)$/;
const KEYFRAME_NAME_REGEXP = /^([^:]+):(-?\d+)$/;
const EFFECT_GROUP_NAME_REGEXP = /^(.*?)((?:\[\w+(?::-?\d+)?:\d+\])+)$/;
const EFFECT_GROUP_EFFECT_REGEXP = /\[(\w+)(?::(-?\d+))?:(\d+)\]/;

class SvgParser {
	parse(options, cwd) {
		return loadSourceFiles(options.source, cwd)
			.then(svgs => {
				return Promise.all(svgs.map(
					svg => parseSvgScenes(svg)
				))
				.then(sceneSets => flatten(sceneSets))
				.then(scenes => getCombinedSceneShapes(scenes));
			});


		function loadSourceFiles(sourcePath, cwd) {
			return expandSourcePaths(sourcePath, cwd)
				.then(paths => {
					return Promise.all(paths.map(
						path => readFile(path, { encoding: 'utf8' })
					));
				});


			function expandSourcePaths(sourcePath, cwd) {
				return expandGlob(sourcePath, { cwd: cwd })
					.then(paths => Promise.all(paths.map(
						relativePath => path.resolve(cwd, relativePath)
					)));
			}
		}

		function parseSvgScenes(svg) {
			return sanitizeSvg(svg)
				.then(svg => parseSvg(svg))
				.then(worksheet => parseWorksheet(worksheet));


			function sanitizeSvg(svg) {
				return Promise.resolve(stripXmlDeclaration(svg));


				function stripXmlDeclaration(svg) {
					return svg.replace(/<\?xml.*?\?>/, '').trim();
				}
			}

			function parseSvg(svg) {
				const project = new paper.Project();
				return new Promise((resolve, reject) => {
					const response = project.importSVG(svg, {
						expandShapes: true,
						applyMatrix: true,
						onLoad: function(scene, svgSource) {
							resolve(scene);
						}
					});
					if (response) { resolve(response); }
				});
			}

			function parseWorksheet(worksheet) {
				const stages = worksheet.children.filter(
					object => STAGE_NAME_REGEXP.test(object.name)
				);
				const scenes = flatten(
					stages.map(stage => {
						const stageName = stage.name;
						const stageNameSegments = STAGE_NAME_REGEXP.exec(stageName);
						const viewportOriginX = Number(stageNameSegments[1]);
						const viewportOriginY = Number(stageNameSegments[2]);
						const viewportOffset = {
							x: -viewportOriginX,
							y: -viewportOriginY
						};
						return stage.children.map(
							scene => parseScene(scene, viewportOffset)
						);
					})
				);
				return scenes;
			}

			function parseScene(scene, viewportOffset) {
				const sceneName = scene.name;
				const sceneNameSegments = SCENE_NAME_REGEXP.exec(sceneName) || [null, sceneName, null, null];
				const sceneId = sceneNameSegments[1];
				const sceneDuration = Number(sceneNameSegments[2] || 1);
				const shapes = flatten(scene.children.map(
					object => getShapes(object, sceneId + ':', viewportOffset)
				));
				const keyframes = flatten(scene.children.map(
					object => getKeyframes(object, sceneId + ':', viewportOffset)
				))
				.sort((a, b) => a.offset - b.offset);
				const effectGroups = flatten(scene.children.map(
					object => getEffectGroups(object, sceneId + ':', viewportOffset)
				))
				.reverse();
				const animatedShapes = getKeyframedShapes(shapes, keyframes, effectGroups, sceneDuration);
				return {
					id: sceneId,
					duration: sceneDuration,
					shapes: animatedShapes
				};


				function getShapes(object, idPrefix, viewportOffset) {
					idPrefix = idPrefix || '';
					const isGroup = (object instanceof paper.Group);
					if (isGroup) {
						const groupId = idPrefix + parseGroupName(object.name);
						return flatten(object.children.map(
							child => getShapes(child, groupId + ':', viewportOffset)
						));
					} else {
						const isKeyframe = KEYFRAME_NAME_REGEXP.test(object.name);
						return (isKeyframe ? [] : parseShapePath(object, idPrefix, viewportOffset));
					}
				}

				function getKeyframes(object, idPrefix, viewportOffset) {
					idPrefix = idPrefix || '';
					const isGroup = (object instanceof paper.Group);
					if (isGroup) {
						const groupId = idPrefix + parseGroupName(object.name);
						return flatten(object.children.map(
							child => getKeyframes(child, groupId + ':', viewportOffset)
						));
					} else {
						const isKeyframe = KEYFRAME_NAME_REGEXP.test(object.name);
						return (isKeyframe ? parseKeyframePath(object, idPrefix, viewportOffset) : []);
					}
				}

				function getEffectGroups(object, idPrefix, viewportOffset) {
					idPrefix = idPrefix || '';
					const isGroup = (object instanceof paper.Group);
					if (isGroup) {
						const groupId = idPrefix + parseGroupName(object.name);
						const isEffectGroup = EFFECT_GROUP_NAME_REGEXP.test(object.name);
						return (isEffectGroup ? [parseEffectGroup(object, idPrefix, viewportOffset)] : []).concat(flatten(object.children.map(
							child => getEffectGroups(child, groupId + ':', viewportOffset)
						)));
					} else {
						return [];
					}
				}

				function parseShapePath(path, idPrefix, viewportOffset) {
					idPrefix = idPrefix || '';
					return {
						id: idPrefix + path.name,
						fillColor: (path.fillColor ? path.fillColor.toCSS() : null),
						strokeColor: (path.strokeWidth && path.strokeColor ? path.strokeColor.toCSS() : null),
						strokeWidth: (path.strokeWidth && path.strokeColor ? path.strokeWidth : null),
						broken: !path.closed,
						path: path.segments.map(segment => {
							return {
								point: addVectors({ x: segment.point.x, y: segment.point.y }, viewportOffset),
								handleIn: { x: segment.handleIn.x, y: segment.handleIn.y },
								handleOut: { x: segment.handleOut.x, y: segment.handleOut.y }
							};
						}),
						keyframes: []
					};
				}

				function parseKeyframePath(path, idPrefix, viewportOffset) {
					const pathName = path.name;
					const pathNameSegments = KEYFRAME_NAME_REGEXP.exec(pathName);
					const targetId = pathNameSegments[1];
					const keyframeOffset = Number(pathNameSegments[2]);
					const shapePath = parseShapePath(path, idPrefix, viewportOffset);
					const keyframeProperties = {
						fillColor: shapePath.fillColor,
						strokeColor: shapePath.strokeColor,
						strokeWidth: shapePath.strokeWidth,
						path: shapePath.path
					};
					return {
						target: idPrefix + targetId,
						offset: keyframeOffset,
						properties: keyframeProperties
					};
				}

				function parseEffectGroup(group, idPrefix, viewportOffset) {
					const groupNameSegments = EFFECT_GROUP_NAME_REGEXP.exec(group.name);
					const groupEffects = parseEffectGroupEffectsString(groupNameSegments[2]);
					const groupBounds = {
						x: group.bounds.x + viewportOffset.x,
						y: group.bounds.y + viewportOffset.y,
						width: group.bounds.width,
						height: group.bounds.height
					};
					const childPathIds = getEffectGroupChildPathIds(group, idPrefix);
					return {
						targets: childPathIds,
						effects: groupEffects.map(effect => Object.assign({}, effect, {
							bounds: groupBounds
						}))
					};

					function parseEffectGroupEffectsString(string, groupBounds) {
						if (!string) { return null; }
						const effects = getRegExpMatches(string, EFFECT_GROUP_EFFECT_REGEXP).map(result => {
							const effectName = result[1];
							const effectOffset = Number(result[2] || 0);
							const effectDuration = Number(result[3] || null);
							return {
								name: effectName,
								offset: effectOffset,
								duration: effectDuration
							};
						});
						return effects;
					}

					function getEffectGroupChildPathIds(object, idPrefix) {
						idPrefix = idPrefix || '';
						const isGroup = (object instanceof paper.Group);
						if (isGroup) {
							const groupId = idPrefix + parseGroupName(object.name);
							return flatten(object.children.map(function(child) {
								return getEffectGroupChildPathIds(child, groupId + ':');
							}));
						} else {
							const isKeyframe = KEYFRAME_NAME_REGEXP.test(object.name);
							const pathId = idPrefix + object.name;
							return (isKeyframe ? [] : [pathId]);
						}
					}
				}

				function getKeyframedShapes(shapes, keyframes, effectGroups, sceneDuration) {
					const shapesById = shapes.reduce((hash, shape) => {
						hash[shape.id] = shape;
						return hash;
					}, {});
					const keyframesByShapeId = keyframes.reduce((hash, keyframe) => {
						const shapeId = keyframe.target;
						if (!(shapeId in shapesById)) { throw new Error(`Invalid animation target: "${shapeId}"`); }
						if (!(shapeId in hash)) { hash[shapeId] = []; }
						const keyframeOffset = (keyframe.offset < 0 ? sceneDuration + keyframe.offset : keyframe.offset);
						const keyframeProperties = keyframe.properties;
						hash[shapeId].push({
							offset: keyframeOffset,
							properties: keyframeProperties
						});
						return hash;
					}, {});
					const keyframedShapes = shapes.map(shape => {
						const shapeKeyframes = (keyframesByShapeId[shape.id] || []).sort((a, b) => a.offset - b.offset);
						const hasInitialKeyframe = (shapeKeyframes.length > 0) && (shapeKeyframes[0].offset === 0);
						const keyframes = (hasInitialKeyframe ? [] : [createInitialKeyframe(shape)]).concat(shapeKeyframes);
						const sceneRestrictedKeyframes = getSceneRestrictedKeyframes(keyframes, sceneDuration);
						return Object.assign({}, shape, {
							fillColor: 'rgba(0,0,0,0)',
							strokeColor: 'rgba(0,0,0,0)',
							keyframes: sceneRestrictedKeyframes
						});
					});
					return getTransformedShapes(keyframedShapes, effectGroups, sceneDuration);


					function getSceneRestrictedKeyframes(keyframes, sceneDuration) {
						const endKeyframe = createKeyframeAtOffset(keyframes, sceneDuration);
						const hideKeyframe = Object.assign({}, endKeyframe, {
							properties: Object.assign({}, endKeyframe.properties, {
								fillColor: 'rgba(0,0,0,0)',
								strokeColor: 'rgba(0,0,0,0)'
							})
						});
						return keyframes.concat([hideKeyframe]);
					}

					function getTransformedShapes(shapes, effectGroups, sceneDuration) {
						const effectsByShapeId = effectGroups.reduce((hash, effectGroup) => {
							const shapeIds = effectGroup.targets;
							shapeIds.forEach(shapeId => {
								if (!(shapeId in hash)) { hash[shapeId] = []; }
								hash[shapeId].push(Object.assign({}, effectGroup, {
									effects: effectGroup.effects.map(effect => Object.assign({}, effect, {
										offset: (effect.offset < 0 ? sceneDuration + effect.offset : effect.offset)
									}))
								}));
							});
							return hash;
						}, {});
						const transformedShapes = shapes.map(
							shape => Object.assign({}, shape, {
								keyframes: (effectsByShapeId[shape.id] || []).reduce((keyframes, effect) => {
									const effectsChain = effect.effects;
									const shapeKeyframes = (keyframes.length === 0 ? [createInitialKeyframe(shape)] : keyframes);
									const transformedShapeKeyframes = effectsChain.reduce((keyframes, effect) => {
										return getTransformedShapeKeyframes(keyframes, effect, sceneDuration, shape.id);
									}, shapeKeyframes);
									return transformedShapeKeyframes;
								}, shape.keyframes)
							})
						);
						return transformedShapes;


						function getTransformedShapeKeyframes(keyframes, effect, sceneDuration, shapeId) {
							const effectName = effect.name;
							switch (effectName) {
								case 'animatein':
									return animateInEffect(keyframes, effect, sceneDuration);
								case 'animateout':
									return animateOutEffect(keyframes, effect, sceneDuration);
								case 'fadein':
									return fadeInEffect(keyframes, effect, sceneDuration);
								case 'fadeout':
									return fadeOutEffect(keyframes, effect, sceneDuration);
								case 'pulse':
									return pulseEffect(keyframes, effect, sceneDuration);
								case 'pop':
									return popEffect(keyframes, effect, sceneDuration);
								case 'jitter':
									return jitterEffect(keyframes, effect, sceneDuration);
								case 'explode':
									return explodeEffect(keyframes, effect, sceneDuration);
								default:
									throw new Error(`Invalid effect: ${effectName}`);
							}


							function animateInEffect(keyframes, effect, sceneDuration) {
								const INITIAL_SCALE = 0.1;
								const INITIAL_OPACITY = 0.1;
								const BOUNCE_SCALE = 1.1;
								const BOUNCE_OPACITY = 0.5;
								const BOUNCE_DURATION = 0.25;
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectContainerBounds = effect.bounds;
								const transformOrigin = {
									x: effectContainerBounds.x + (effectContainerBounds.width / 2),
									y: effectContainerBounds.y + (effectContainerBounds.height / 2)
								};
								const startKeyframe = createKeyframeAtOffset(keyframes, effectOffset);
								const bounceKeyframe = createKeyframeAtOffset(keyframes, lastEffectFrameOffset - Math.ceil(BOUNCE_DURATION * effectDuration));
								const transformedBounceKeyframe = Object.assign({}, bounceKeyframe, {
									properties: Object.assign({}, bounceKeyframe.properties, {
										fillColor: bounceKeyframe.properties.fillColor ? getAlphaColor(bounceKeyframe.properties.fillColor, BOUNCE_OPACITY) : null,
										strokeColor: bounceKeyframe.properties.strokeColor ? getAlphaColor(bounceKeyframe.properties.strokeColor, BOUNCE_OPACITY) : null,
										path: getScaledPath(bounceKeyframe.properties.path, BOUNCE_SCALE, transformOrigin)
									})
								});
								const endKeyframe = createKeyframeAtOffset(keyframes, lastEffectFrameOffset);
								const transformedStartKeyframe = Object.assign({}, startKeyframe, {
									properties: Object.assign({}, startKeyframe.properties, {
										fillColor: (startKeyframe.properties.fillColor ? getAlphaColor(startKeyframe.properties.fillColor, INITIAL_OPACITY) : null),
										strokeColor: (startKeyframe.properties.strokeColor ? getAlphaColor(startKeyframe.properties.strokeColor, INITIAL_OPACITY) : null),
										path: getScaledPath(startKeyframe.properties.path, INITIAL_SCALE, transformOrigin)
									})
								});
								const tweenedKeyframes = insertKeyframe(insertKeyframe(insertKeyframe(keyframes, transformedStartKeyframe), transformedBounceKeyframe), endKeyframe);
								if (effectOffset === 0) { return tweenedKeyframes; }
								const effectStartKeyframe = Object.assign({}, transformedStartKeyframe, {
									offset: effectOffset - 1,
									properties: Object.assign({}, transformedStartKeyframe.properties, {
										fillColor: 'rgba(0,0,0,0)',
										strokeColor: 'rgba(0,0,0,0)'
									})
								});
								return [effectStartKeyframe].concat(getKeyframesFromOffset(tweenedKeyframes, effectOffset));
							}

							function animateOutEffect(keyframes, effect, sceneDuration) {
								const END_SCALE = 0.3;
								const END_OPACITY = 0.1;
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectContainerBounds = effect.bounds;
								const transformOrigin = {
									x: effectContainerBounds.x + (effectContainerBounds.width / 2),
									y: effectContainerBounds.y + (effectContainerBounds.height / 2)
								};
								const startKeyframe = createKeyframeAtOffset(keyframes, effectOffset);
								const endKeyframe = createKeyframeAtOffset(keyframes, lastEffectFrameOffset);
								const transformedEndKeyframe = Object.assign({}, endKeyframe, {
									properties: Object.assign({}, endKeyframe.properties, {
										fillColor: (endKeyframe.properties.fillColor ? getAlphaColor(endKeyframe.properties.fillColor, END_OPACITY) : null),
										strokeColor: (endKeyframe.properties.strokeColor ? getAlphaColor(endKeyframe.properties.strokeColor, END_OPACITY) : null),
										path: getScaledPath(endKeyframe.properties.path, END_SCALE, transformOrigin)
									})
								});
								const tweenedKeyframes = insertKeyframe(insertKeyframe(keyframes, startKeyframe), transformedEndKeyframe);
								if (lastEffectFrameOffset === sceneDuration - 1) { return tweenedKeyframes; }
								const effectEndKeyframe = Object.assign({}, transformedEndKeyframe, {
									offset: lastEffectFrameOffset + 1,
									properties: Object.assign({}, transformedEndKeyframe.properties, {
										fillColor: 'rgba(0,0,0,0)',
										strokeColor: 'rgba(0,0,0,0)'
									})
								});
								return getKeyframesUntilOffset(tweenedKeyframes, lastEffectFrameOffset).concat([effectEndKeyframe]);
							}

							function fadeInEffect(keyframes, effect, sceneDuration) {
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectFrames = range(effectOffset, effectOffset + effectDuration).map(offset => {
									const keyframe = createKeyframeAtOffset(keyframes, offset);
									const t = (offset - effectOffset) / effectDuration;
									const opacity = t;
									const transformedKeyframe = Object.assign({}, keyframe, {
										properties: Object.assign({}, keyframe.properties, {
											fillColor: (keyframe.properties.fillColor ? getAlphaColor(keyframe.properties.fillColor, opacity) : null),
											strokeColor: (keyframe.properties.strokeColor ? getAlphaColor(keyframe.properties.strokeColor, opacity) : null)
										})
									});
									return transformedKeyframe;
								});
								const transformedKeyframes = effectFrames.concat(getKeyframesAfterOffset(keyframes, lastEffectFrameOffset));
								if (effectOffset === 0) { return transformedKeyframes; }
								const startKeyframe = createKeyframeAtOffset(keyframes, effectOffset - 1);
								const hiddenStartKeyframe = Object.assign({}, startKeyframe, {
									properties: Object.assign({}, startKeyframe.properties, {
										fillColor: 'rgba(0,0,0,0)',
										strokeColor: 'rgba(0,0,0,0)'
									})
								});
								return [hiddenStartKeyframe].concat(transformedKeyframes);
							}

							function fadeOutEffect(keyframes, effect, sceneDuration) {
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectFrames = range(effectOffset, effectOffset + effectDuration).map(offset => {
									const keyframe = createKeyframeAtOffset(keyframes, offset);
									const t = (offset - effectOffset) / effectDuration;
									const opacity = 1 - t;
									const transformedKeyframe = Object.assign({}, keyframe, {
										properties: Object.assign({}, keyframe.properties, {
											fillColor: (keyframe.properties.fillColor ? getAlphaColor(keyframe.properties.fillColor, opacity) : null),
											strokeColor: (keyframe.properties.strokeColor ? getAlphaColor(keyframe.properties.strokeColor, opacity) : null)
										})
									});
									return transformedKeyframe;
								});
								const transformedKeyframes = getKeyframesBeforeOffset(keyframes, effectOffset).concat(effectFrames);
								if (lastEffectFrameOffset === sceneDuration - 1) { return transformedKeyframes; }
								const endKeyframe = createKeyframeAtOffset(keyframes, effectOffset + effectDuration);
								const hiddenEndKeyframe = Object.assign({}, endKeyframe, {
									properties: Object.assign({}, endKeyframe.properties, {
										fillColor: 'rgba(0,0,0,0)',
										strokeColor: 'rgba(0,0,0,0)'
									})
								});
								return transformedKeyframes.concat([hiddenEndKeyframe]);
							}

							function pulseEffect(keyframes, effect, sceneDuration) {
								const PULSE_SCALE = 1.3;
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectContainerBounds = effect.bounds;
								const transformOrigin = {
									x: effectContainerBounds.x + (effectContainerBounds.width / 2),
									y: effectContainerBounds.y + (effectContainerBounds.height / 2)
								};
								const effectFrames = range(effectOffset, effectOffset + effectDuration).map(offset => {
									const keyframe = createKeyframeAtOffset(keyframes, offset);
									const t = (offset - effectOffset) / effectDuration;
									const scale = getScaleValue(t, PULSE_SCALE);
									const transformedKeyframe = Object.assign({}, keyframe, {
										properties: Object.assign({}, keyframe.properties, {
											path: getScaledPath(keyframe.properties.path, scale, transformOrigin)
										})
									});
									return transformedKeyframe;
								});
								return getKeyframesBeforeOffset(keyframes, effectOffset).concat(effectFrames).concat(getKeyframesAfterOffset(keyframes, lastEffectFrameOffset));


								function getScaleValue(t, maxScale) {
									const easedValue = easeInOutQuad(t <= 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5);
									return 1 + easedValue * (maxScale - 1);
								}
							}

							function popEffect(keyframes, effect, sceneDuration) {
								const POP_SCALE = 1.3;
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectContainerBounds = effect.bounds;
								const transformOrigin = {
									x: effectContainerBounds.x + (effectContainerBounds.width / 2),
									y: effectContainerBounds.y + (effectContainerBounds.height / 2)
								};
								const effectFrames = range(effectOffset, effectOffset + effectDuration).map(offset => {
									const keyframe = createKeyframeAtOffset(keyframes, offset);
									const t = (offset - effectOffset) / effectDuration;
									const scale = getScaleValue(t, POP_SCALE);
									const opacity = getOpacityValue(t);
									const transformedKeyframe = Object.assign({}, keyframe, {
										properties: Object.assign({}, keyframe.properties, {
											fillColor: keyframe.properties.fillColor ? getAlphaColor(keyframe.properties.fillColor, opacity) : null,
											strokeColor: keyframe.properties.strokeColor ? getAlphaColor(keyframe.properties.strokeColor, opacity) : null,
											path: getScaledPath(keyframe.properties.path, scale, transformOrigin)
										})
									});
									return transformedKeyframe;
								});
								return getKeyframesBeforeOffset(keyframes, effectOffset).concat(effectFrames).concat(getKeyframesAfterOffset(keyframes, lastEffectFrameOffset));


								function getScaleValue(t, maxScale) {
									if (t === 1) { return 0; }
									return 1 + easeInOutQuad(t) * (maxScale - 1);
								}

								function getOpacityValue(t) {
									if (t === 1) { return 0; }
									return easeInOutQuad(1 - t);
								}
							}

							function jitterEffect(keyframes, effect, sceneDuration) {
								const JITTER_AMOUNT = 7;
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectFrames = range(effectOffset, effectOffset + effectDuration).map(offset => {
									const keyframe = createKeyframeAtOffset(keyframes, offset);
									const t = (offset - effectOffset) / effectDuration;
									const intensity = t * JITTER_AMOUNT;
									const jitterOffset = {
										x: -0.5 * intensity + random() * intensity,
										y: -0.5 * intensity + random() * intensity
									};
									const transformedKeyframe = Object.assign({}, keyframe, {
										properties: Object.assign({}, keyframe.properties, {
											path: getTranslatedPath(keyframe.properties.path, jitterOffset)
										})
									});
									return transformedKeyframe;
								});
								return getKeyframesBeforeOffset(keyframes, effectOffset).concat(effectFrames).concat(getKeyframesAfterOffset(keyframes, lastEffectFrameOffset));
							}


							function explodeEffect(keyframes, effect, sceneDuration) {
								const GRAVITY = 2;
								const effectOffset = effect.offset;
								const effectDuration = Math.min(sceneDuration - effectOffset, effect.duration);
								const lastEffectFrameOffset = (effectOffset + effectDuration - 1);
								const effectContainerBounds = effect.bounds;
								const effectFrames = range(effectOffset, effectOffset + effectDuration).map(offset => {
									const keyframe = createKeyframeAtOffset(keyframes, effectOffset);
									const t = (offset - effectOffset) / effectDuration;
									const warpFactor = getScaleValue(1 - t);
									const transformedKeyframe = Object.assign({}, keyframe, {
										offset: offset,
										properties: Object.assign({}, keyframe.properties, {
											path: getWarpedPath(keyframe.properties.path, effectContainerBounds, warpFactor, GRAVITY)
										})
									});
									return transformedKeyframe;
								});
								return getKeyframesBeforeOffset(keyframes, effectOffset).concat(effectFrames).concat(getKeyframesAfterOffset(keyframes, lastEffectFrameOffset));


								function getScaleValue(t) {
									return easeInOutExpo(t);
								}
							}


							function getTranslatedPath(path, offset) {
								return path.map(segment => {
									return {
										point: addVectors(segment.point, offset),
										handleIn: segment.handleIn,
										handleOut: segment.handleOut
									};
								});
							}

							function getScaledPath(path, scale, origin) {
								return path.map(segment => {
									return {
										point: addVectors(origin, scaleVector(subtractVector(segment.point, origin), scale)),
										handleIn: scaleVector(segment.handleIn, scale),
										handleOut: scaleVector(segment.handleOut, scale)
									};
								});
							}

							function getWarpedPath(path, warpBounds, warpFactor, gravity) {
								const transformOrigin = {
									x: warpBounds.x + (warpBounds.width / 2),
									y: warpBounds.y + (warpBounds.height / 2)
								};
								const maxDistanceFromOrigin = getVectorLength({ x: warpBounds.width / 2, y: warpBounds.height / 2 });
								return path.map(segment => {
									const distanceFromOrigin = getVectorLength(subtractVector(segment.point, transformOrigin));
									const gravityRatio = gravity * easeOutQuad(1 - (distanceFromOrigin / maxDistanceFromOrigin));
									const scale = Math.max(0, (1 - warpFactor * (1 + gravity * gravityRatio)));
									const scaledPoint = getScaledVector(segment.point, scale, transformOrigin);
									const scaledHandleIn = subtractVector(getScaledVector(addVectors(segment.handleIn, segment.point), scale, transformOrigin), scaledPoint);
									const scaledHandleOut = subtractVector(getScaledVector(addVectors(segment.handleOut, segment.point), scale, transformOrigin), scaledPoint);
									return {
										point: scaledPoint,
										handleIn: scaledHandleIn,
										handleOut: scaledHandleOut
									};
								});


								function getScaledVector(vector, scale, origin) {
									return addVectors(origin, scaleVector(subtractVector(vector, origin), scale));
								}
							}
						}
					}
				}

				function parseGroupName(groupName) {
					const isEffectGroup = EFFECT_GROUP_NAME_REGEXP.test(groupName);
					return (isEffectGroup ? EFFECT_GROUP_NAME_REGEXP.exec(groupName)[1] : groupName);
				}

				function getKeyframesBeforeOffset(keyframes, offset) {
					return keyframes.filter(keyframe => (keyframe.offset < offset));
				}

				function getKeyframesAfterOffset(keyframes, offset) {
					return keyframes.filter(keyframe => (keyframe.offset > offset));
				}

				function getKeyframesUntilOffset(keyframes, offset) {
					return keyframes.filter(keyframe => (keyframe.offset <= offset));
				}

				function getKeyframesFromOffset(keyframes, offset) {
					return keyframes.filter(keyframe => (keyframe.offset >= offset));
				}

				function getKeyframeAfterOffset(keyframes, offset) {
					return getKeyframesAfterOffset(keyframes, offset).shift();
				}

				function getKeyframeAtOffset(keyframes, offset) {
					return keyframes.filter(keyframe => (keyframe.offset <= offset)).pop() || keyframes[0];
				}

				function createKeyframeAtOffset(keyframes, offset) {
					const activeKeyframe = getKeyframeAtOffset(keyframes, offset);
					if (activeKeyframe.offset === offset) { return activeKeyframe; }
					const nextKeyframe = getKeyframeAfterOffset(keyframes, offset);
					if (!nextKeyframe) {
						return Object.assign({}, activeKeyframe, {
							offset: offset
						});
					}
					return getInterpolatedKeyframe(activeKeyframe, nextKeyframe, offset);
				}

				function insertKeyframe(keyframes, keyframe) {
					const offset = keyframe.offset;
					const beforeKeyframes = getKeyframesBeforeOffset(keyframes, offset);
					const afterKeyframes = getKeyframesAfterOffset(keyframes, offset);
					return beforeKeyframes.concat([keyframe]).concat(afterKeyframes);
				}

				function getInterpolatedKeyframe(keyframe1, keyframe2, targetOffset) {
					if (keyframe1.offset === targetOffset) { return keyframe1; }
					if (keyframe2.offset === targetOffset) { return keyframe2; }
					const ratio = (targetOffset - keyframe1.offset) / (keyframe2.offset - keyframe1.offset);
					return Object.assign({}, keyframe1, {
						offset: targetOffset,
						properties: Object.assign({}, keyframe1.properties, {
							path: getInterpolatedPath(keyframe1.properties.path, keyframe2.properties.path, ratio)
						})
					});


					function getInterpolatedPath(path1, path2, ratio) {
						return path1.map((segment1, index) => {
							const segment2 = path2[index];
							const easedRatio = easeInOutExpo(ratio);
							return {
								point: getInterpolatedPoint(segment1.point, segment2.point, easedRatio),
								handleIn: getInterpolatedPoint(segment1.handleIn, segment2.handleIn, easedRatio),
								handleOut: getInterpolatedPoint(segment1.handleOut, segment2.handleOut, easedRatio)
							};
						});


						function getInterpolatedPoint(point1, point2, ratio) {
							return addVectors(point1, scaleVector(subtractVector(point2, point1), ratio));
						}
					}
				}

				function createInitialKeyframe(shape) {
					return {
						offset: 0,
						properties: {
							fillColor: shape.fillColor,
							strokeColor: shape.strokeColor,
							strokeWidth: shape.strokeWidth,
							path: shape.path
						}
					};
				}
			}
		}

		function getCombinedSceneShapes(scenes) {
			const sceneOffsets = scenes.reduce((offsets, scene, index, array) => {
				const previousSceneOffset = (index === 0 ? 0 : offsets[index - 1]);
				const previousSceneDuration = (index === 0 ? 0 : array[index - 1].duration);
				const sceneOffset = previousSceneOffset + previousSceneDuration;
				return offsets.concat(sceneOffset);
			}, []);
			return flatten(scenes.map((scene, index) => {
				const sceneOffset = sceneOffsets[index];
				return getTimeshiftedShapes(scene.shapes, sceneOffset);
			}));



			function getTimeshiftedShapes(shapes, timeOffset) {
				return shapes.map(
					shape => Object.assign({}, shape, {
						keyframes: shape.keyframes.map(
							keyframe => Object.assign({}, keyframe, {
								offset: keyframe.offset + timeOffset
							})
						)
					})
				);
			}
		}
	}
}

module.exports = SvgParser;


function getRegExpMatches(string, pattern) {
	const regexp = new RegExp(pattern.source, 'g');
	const matches = [];
	let result;
	while ((result = regexp.exec(string))) { matches.push(result); }
	return matches;
}

function addVectors(a, b) {
	return {
		x: a.x + b.x,
		y: a.y + b.y
	};
}

function subtractVector(a, b) {
	return {
		x: a.x - b.x,
		y: a.y - b.y
	};
}

function scaleVector(vector, scalar) {
	return {
		x: vector.x * scalar,
		y: vector.y * scalar
	};
}

function getVectorLength(vector) {
	return Math.sqrt(vector.x * vector.x, vector.y * vector.y);
}

function easeOutQuad(t) {
	return -1 * t * (t - 2);
}

function easeInOutExpo(t) {
	return (t *= 2) < 1 ? 0.5 * Math.pow(2, 10 * (t - 1)) : 0.5 * (-Math.pow(2, -10 * --t) + 2);
}

function easeInOutQuad(x) {
	return ((x /= 0.5) < 1 ? 0.5 * x * x : -0.5 * ((--x) * (x - 2) - 1));
}

function getAlphaColor(colorString, opacity) {
	if (!colorString) { return null; }
	const color = parseColor(colorString);
	const updatedColor = Object.assign({}, color, {
		a: color.a * opacity
	});
	return formatCssColor(updatedColor);


	function formatCssColor(color) {
		return 'rgba(' + [color.r, color.g, color.b, color.a].join(',') + ')';
	}
}
