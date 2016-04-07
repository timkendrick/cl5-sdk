'use strict';

(function() {
	const DECODE_STRING = 'Y3JlYXRpdmVsYWI1LmNvbS9yYWJiaXRob2xl';
	const PEN_ACTIVATE_CODE = 104743;
	const GIOCONDA_SOURCE_ELEMENT_ID = 'cl5';
	const GIOCONDA_TARGET_ELEMENT_ID = 'rabbit';
	const GIOCONDA_SOURCE_CLASS_INDEX = 1;
	const COLOR_MATCHER_PALETTE = ["#4285F4", "#EA4235", "#FBBC05", "#34A853"];

	window.helloWorld();
	window.hint();
	window.puzzle();
	applySecretClass()
		.then(() => {
			window.weird();
			window.decode(DECODE_STRING);
			window.activatePen(PEN_ACTIVATE_CODE);
			window.penToolActivated = false;
			window.finalTest(createColorMatcherFunction(COLOR_MATCHER_PALETTE));
		});


	function applySecretClass() {
		return new Promise((resolve, reject) => {
			const sourceElement = document.getElementById(GIOCONDA_SOURCE_ELEMENT_ID);
			const targetElement = document.getElementById(GIOCONDA_TARGET_ELEMENT_ID);
			const secretClassName = sourceElement.classList[GIOCONDA_SOURCE_CLASS_INDEX];
			createOneShotAttributeObserver(targetElement, function(event) {
				resolve();
			});
			targetElement.classList.add(secretClassName);
		});


		function createOneShotAttributeObserver(element, callback) {
			const observer = new window.MutationObserver(event => {
				observer.disconnect();
				callback();
			});
			observer.observe(element, { attributes: true });
		}
	}

	function createColorMatcherFunction(colors) {
		return function(hex) {
			return findNearestColor(hex, colors);
		}


		function findNearestColor(hex, colors) {
			const inputRgb = getRgbComponents(hex);
			const sortedColors = colors.map(hex => {
				return {
					hex: hex,
					rgb: getRgbComponents(hex)
				};
			})
			.map(color => {
				const distanceR = Math.abs(color.rgb.r - inputRgb.r);
				const distanceG = Math.abs(color.rgb.g - inputRgb.g);
				const distanceB = Math.abs(color.rgb.b - inputRgb.b);
				return Object.assign({}, color, {
					distance: distanceR + distanceG + distanceB
				});
			})
			.sort((a, b) => (a.distance - b.distance))
			.map(color => color.hex);
			return sortedColors[0];


			function getRgbComponents(hex) {
				const hexComponents = /#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
				return {
					r: parseInt(hexComponents[1], 0x10),
					g: parseInt(hexComponents[2], 0x10),
					b: parseInt(hexComponents[3], 0x10)
				};
			}
		}
	}
})();
