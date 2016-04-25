'use strict';

window.loadAnimation = function(animation) {
	const board = window.board;
	resetBoard(board);
	renderTextFrames(board, animation.text);
	renderShapes(board, animation.shapes);
	saveBoardState(board);
	updateView();


	function renderTextFrames(board, frames) {
		const parsedKeyframes = parseTextKeyframes(board, frames);
		parsedKeyframes.forEach(keyframe => addTextKeyframe(board, keyframe));


		function addTextKeyframe(board, keyframe) {
			board.addQuillKeyFrame(
				keyframe.handleX,
				keyframe.handleY,
				keyframe.editorX,
				keyframe.editorY,
				keyframe.text,
				keyframe.timeMarker
			);
		}

		function parseTextKeyframes(board, frames) {
			const DEFAULT_TEXT_POSITION = { x: -266, y: 64 };
			const DEFAULT_TEXT_SIZE = '12px';
			const EDITOR_HANDLE_OFFSET = { x: 260, y: -24 };
			return frames.map(frame => createTextKeyframe(frame));


			function createTextKeyframe({ time, text, style, position }) {
				const coordinates = getTextPosition(position);
				return Object.assign({
					timeMarker: time,
					text: getFormattedText(text, Object.assign({ 'font-size': DEFAULT_TEXT_SIZE }, style))
				}, coordinates);


				function getTextPosition(position) {
					position = position || DEFAULT_TEXT_POSITION;
					const editorX = (window.w / 2) + position.x;
					const editorY = (window.h / 2) + position.y;
					const handleX = editorX + EDITOR_HANDLE_OFFSET.x;
					const handleY = editorY + EDITOR_HANDLE_OFFSET.y;
					return {
						handleX: handleX,
						handleY: handleY,
						editorX: editorX,
						editorY: editorY
					};
				}

				function getFormattedText(text, styles) {
					styles = styles || {};
					if (!text) { text = '<br>'; }
					const styledText = getStyledText(text, styles);
					const alignedText = getAlignedText(styledText, styles['text-align']);
					return alignedText;


					function getStyledText(text, styles) {
						if (!styles) { return text; }
						const css = getCssString(styles);
						return `<span style="${css}">${text}</span>`;


						function getCssString(styles) {
							return Object.keys(styles)
								.filter(key => key !== 'text-align')
								.map(key => `${key}: ${styles[key]};`)
								.join(' ');
						}
					}

					function getAlignedText(text, textAlign) {
						if (!textAlign) { return `<div>${text}</div>`; }
						return `<div style="text-align: ${textAlign};">${text}</div>`;
					}
				}
			}
		}
	}

	function renderShapes(board, shapeDefinitions) {
		const drawOffset = getDrawOffset();
		const shapes = createShapes(board, shapeDefinitions, drawOffset);
		shapes.forEach(shape => board.addShape(shape));


		function createShapes(board, shapeDefinitions, drawOffset) {
			return shapeDefinitions.map(shapeDefinition => {
				const shape = createShape(board, shapeDefinition, drawOffset);
				getTimeOrderedKeyframeDefinitions(shapeDefinition.keyframes).forEach(keyframeDefinition => {
					addShapeKeyframe(shape, keyframeDefinition, drawOffset);
				});
				return shape;
			});


			function getTimeOrderedKeyframeDefinitions(keyframeDefinitions) {
				return keyframeDefinitions.slice().sort((a, b) => a.offset - b.offset);
			}


			function createShape(board, shapeDefinition, drawOffset) {
				const fillColor = shapeDefinition.fillColor || 'rgba(0,0,0,0)';
				const strokeColor = shapeDefinition.strokeColor || 'rgba(0,0,0,0)';
				const strokeWidth = shapeDefinition.strokeWidth || 0;
				const path = createPath(shapeDefinition.path, drawOffset);
				const isSmooth = false;
				const isLine = false;
				const GShape = getGShapeConstructor(board);
				const shape = new GShape(path, isSmooth, fillColor, strokeColor, isLine);
				if (strokeWidth) {
					shape.path.strokeWidth = strokeWidth;
					shape.path.strokeW = strokeWidth;
				}
				return shape;

				function createPath(pathDefinition, drawOffset) {
					const numSides = pathDefinition.length;
					const offsetPathDefinition = getOffsetPathDefinition(pathDefinition, drawOffset);
					const path = new window.paper.Path.RegularPolygon(new window.paper.Point(0, 0), numSides, 1);
					offsetPathDefinition.forEach((segmentDefinition, index) => {
						const segment = path.segments[index];
						segment.point.x = segmentDefinition.point.x;
						segment.point.y = segmentDefinition.point.y;
						segment.handleIn.x = segmentDefinition.handleIn.x;
						segment.handleIn.y = segmentDefinition.handleIn.y;
						segment.handleOut.x = segmentDefinition.handleOut.x;
						segment.handleOut.y = segmentDefinition.handleOut.y;
					});
					return path;
				}

				function getGShapeConstructor(board) {
					return board.shapes[0].constructor;
				}
			}


			function addShapeKeyframe(shape, keyframeDefinition, drawOffset) {
				const timeOffset = keyframeDefinition.offset;
				const keyframeProperties = keyframeDefinition.properties;
				const hasUpdates = Boolean(keyframeProperties.path) || Boolean(keyframeProperties.fillColor) || Boolean(keyframeProperties.strokeColor) || (keyframeProperties.strokeWidth === 'number');
				if (!hasUpdates) { return null; }
				const currentKeyframe = getKeyframeAtOffset(shape, timeOffset);
				const targetProperties = Object.assign({}, keyframeProperties, {
					path: keyframeProperties.path ? getOffsetPathDefinition(keyframeProperties.path, drawOffset) : null
				});
				const keyframe = createKeyframe(shape, timeOffset, targetProperties, currentKeyframe);
				if (keyframe) { shape.addKey(keyframe); }
				return keyframe;


				function getKeyframeAtOffset(shape, offset) {
					return shape.keyframes.filter(keyframe => (keyframe.time <= offset))
					.sort((a, b) => (a.time - b.time))
					.pop();
				}

				function createKeyframe(shape, timeOffset, properties, sourceKeyframe) {
					const Keyframe = sourceKeyframe.constructor;
					const keyframeProperties = stripNullValues(properties);
					const hasPathUpdates = Boolean(keyframeProperties.path);
					const state = (hasPathUpdates ? createPathState(shape, keyframeProperties.path) : clonePathState(sourceKeyframe.state));
					const fillColor = keyframeProperties.fillColor || null;
					const strokeColor = keyframeProperties.strokeColor || null;
					const strokeWidth = keyframeProperties.strokeWidth || 0;
					const handlesMoved = hasPathUpdates;
					return new Keyframe(handlesMoved, timeOffset, state, fillColor, strokeColor, strokeWidth);


					function createPathState(shape, path) {
						const clonedPathState = shape.getPositionCopy();
						path.forEach((segment, index) => {
							clonedPathState.point[index].x = segment.point.x;
							clonedPathState.point[index].y = segment.point.y;
							clonedPathState.handleIn[index].x = segment.handleIn.x;
							clonedPathState.handleIn[index].y = segment.handleIn.y;
							clonedPathState.handleOut[index].x = segment.handleOut.x;
							clonedPathState.handleOut[index].y = segment.handleOut.y;
						});
						return clonedPathState;
					}

					function clonePathState(state) {
						return {
							point: state.point.map(point => point.clone()),
							handleIn: state.handleIn.map(point => point.clone()),
							handleOut: state.handleOut.map(point => point.clone())
						};
					}

					function stripNullValues(object) {
						return Object.keys(object)
						.filter(key => (object[key] !== null))
						.reduce((updatedObject, key) => {
							updatedObject[key] = object[key];
							return updatedObject;
						}, {});
					}
				}
			}

			function getOffsetPathDefinition(pathDefinition, offset) {
				return pathDefinition.map(segmentDefinition => {
					return {
						point: getOffsetPointDefinition(segmentDefinition.point, offset),
						handleIn: getOffsetPointDefinition(segmentDefinition.handleIn, null),
						handleOut: getOffsetPointDefinition(segmentDefinition.handleOut, null)
					};
				});


				function getOffsetPointDefinition(point, offset) {
					offset = offset || { x: 0, y: 0 };
					return Object.assign({
						x: point.x + offset.x,
						y: point.y + offset.y
					});
				}
			}
		}

		function getDrawOffset() {
			return {
				x: window.w / 2,
				y: window.h / 2
			};
		}
	}

	function resetBoard(board) {
		clearTextKeyframes(board);
		clearShapeKeyframes(board);
		clearBoardHistory(board);


		function clearShapeKeyframes(board) {
			board.deleteAll();
			board.setStage();
		}

		function clearTextKeyframes(board) {
			board.quillKeyFrames.length = 0;
		}

		function clearBoardHistory(board) {
			board.history.length = 0;
		}
	}

	function saveBoardState(board) {
		board.checkpoint();
	}

	function updateView() {
		window.paper.view.update();
	}
};
