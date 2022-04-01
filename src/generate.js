const DDL = require('ddl-parser');
const fs = require('fs-extra');
const he = require('he');
require('colors');

// Non ES module version of https://github.com/sindresorhus/log-symbols
const main = {
	info: 'ℹ'.blue,
	success: '✔'.green,
	warning: '⚠'.yellow,
	error: '✖'.red,
};

const fallback = {
	info: 'i'.blue,
	success: '√'.green,
	warning: '‼'.yellow,
	error: '×'.red,
};

const logSymbols = isUnicodeSupported() ? main : fallback;


let unknownProtocolNameCounter = 0;
const kinnayWikiBase = 'https://github.com/kinnay/NintendoClients/wiki';

// Standardize the type names to match Kinnay's wiki
const COMMON_TYPE_CONVERSIONS = {
	'qvector<byte>': 'Buffer',
	'byte': 'Uint8',
	'uint16': 'Uint16',
	'uint32': 'Uint32',
	'uint64': 'Uint64',
	'int8': 'Sint8',
	'int16': 'Sint16',
	'int32': 'Sint32',
	'int64': 'Sint64',
	'string': 'String',
	'bool': 'Bool',
	'datetime': 'DateTime',
	'qresult': 'Result',
	'stationurl': 'StationURL',
	'qBuffer': 'qBuffer', // Just so it's found
	'buffer': 'Buffer',
	'ResultRange': 'ResultRange', // Just so it's found
	'variant': 'Variant',
	'any<Data,string>': 'AnyDataHolder' // unsure if this can look different
};

// Links to common types in Kinnay's wiki
const COMMON_TYPE_LINKS = {
	'String': `${kinnayWikiBase}/NEX-Common-Types#string`,
	'Buffer': `${kinnayWikiBase}/NEX-Common-Types#buffer`,
	'qBuffer': `${kinnayWikiBase}/NEX-Common-Types#qbuffer`,
	'List': `${kinnayWikiBase}/NEX-Common-Types#list`,
	'Map': `${kinnayWikiBase}/NEX-Common-Types#map`,
	'PID': `${kinnayWikiBase}/NEX-Common-Types#pid`,
	'Result': `${kinnayWikiBase}/NEX-Common-Types#result`,
	'DateTime': `${kinnayWikiBase}/NEX-Common-Types#datetime`,
	'StationURL': `${kinnayWikiBase}/NEX-Common-Types#stationurl`,
	'Variant': `${kinnayWikiBase}/NEX-Common-Types#variant`,
	'Structure': `${kinnayWikiBase}/NEX-Common-Types#structure`,
	'Data': `${kinnayWikiBase}/NEX-Common-Types#data`,
	'AnyDataHolder': `${kinnayWikiBase}/NEX-Common-Types#anydataholder`,
	'RVConnectionData': `${kinnayWikiBase}/NEX-Common-Types#rvconnectiondata`,
	'ResultRange': `${kinnayWikiBase}/NEX-Common-Types#resultrange`
};

function generateDocumentation(tree, outputPath) {
	/*-------------------------------------------
	| First parse out the larger DDL parse tree |
	|   Into smaller, more managable, pieces    |
	-------------------------------------------*/

	const protocolMethods = [];
	const protocolClasses = [];
	let protocolName;
	let protocolID;

	for (const element of tree.rootNamespace.elements) {
		if (element.body instanceof DDL.DDLClassDeclaration) {
			const className = element.body.typeDeclaration.declaration.nameSpaceItem.parseTreeItem1.name.value;
			const classMembers = [];
			let classParentClassName = element.body.parentClassName.value;

			if (classParentClassName === '') {
				classParentClassName = 'Structure';
			}

			for (const { body: classMember } of element.body.classMembers.elements) {
				const classMemberName = classMember.nameSpaceItem.parseTreeItem1.name.value;
				const classMemberType = classMember.declarationUse.name.value;

				classMembers.push({
					name: classMemberName,
					type: classMemberType
				});
			}

			protocolClasses.push({
				name: className,
				members: classMembers,
				parentClassName: classParentClassName
			});
		}

		if (element.body instanceof DDL.DDLProtocolDeclaration) {
			// Could also be element.body.declaration.unitName.value ?
			protocolName = element.body.declaration.nameSpaceItem.parseTreeItem1.name.value;
			protocolID = 'Unknown ID'; // TODO: Find a way to find this!!

			if (!protocolName) {
				protocolName = `Unknown Protocol - ${unknownProtocolNameCounter++}`;
				console.log(`[${logSymbols.warning}]`, `Could not determine real protocol name. Defaulting to ${protocolName}`.yellow.bold);
			}

			console.log(`[${logSymbols.info}]`, `Found NEX protocol: ${protocolName}`.cyan.bold);

			for (const { body: method} of element.body.methods.elements) {
				const methodName = method.methodDeclaration.declaration.nameSpaceItem.parseTreeItem1.name.value;
				const methodRequestParameters = [];
				const methodResponseParameters = [];

				// these are also stored in method.methodDeclaration.parameters
				for (const { body: parameter } of method.parameters.elements) {
					const parameterName = parameter.variable.nameSpaceItem.parseTreeItem1.name.value;
					// This also seems to be stored in parameter.variable.declarationUse
					const parameterValue = parameter.declarationUse.name.value;
					const parameterType = parameter.type;
					const paramaterDefinition = {
						name: parameterName,
						value: parameterValue
					};

					if (parameterType === 1) {
						methodRequestParameters.push(paramaterDefinition);
					} else if (parameterType === 2) {
						methodResponseParameters.push(paramaterDefinition);
					} else if (parameter instanceof DDL.DDLReturnValue) {
						// ReturnValue types always come first
						methodResponseParameters.unshift(paramaterDefinition);
					} else {
						throw new Error(`Unknown paramater type ${parameterType}`);
					}
				}

				protocolMethods.push({
					name: methodName,
					requestParameters: methodRequestParameters,
					responseParameters: methodResponseParameters,
				});
			}


			const markdown = buildMarkDown(protocolName, protocolID, protocolMethods, protocolClasses);
			fs.ensureDirSync(`${outputPath}`);
			fs.writeFileSync(`${outputPath}/${protocolName}.md`, markdown);

			console.log(`[${logSymbols.success}]`, `Writing protocol documentation to ${outputPath}/${protocolName}.md\n`.green.bold);
		}
	}

	/*------------------------------------------------
	| Now start building a .md file for the protocol |
	------------------------------------------------*/
}

function buildMarkDown(protocolName, protocolID, protocolMethods, protocolClasses) {
	let mdFileContents = `## [NEX-Protocols](${kinnayWikiBase}/NEX-Protocols) > ${protocolName} (${protocolID})`;

	const methodsTable = buildMethodsTable(protocolMethods);
	mdFileContents += `\n\n${methodsTable}`;

	for (const protocolMethod of protocolMethods) {
		const methodID = protocolMethods.indexOf(protocolMethod) + 1;
		const methodDocumentation = buildMethodDocumentation(protocolMethod, methodID, protocolClasses);
		mdFileContents += `\n\n${methodDocumentation}`;
	}

	if (protocolClasses.length > 0) {
		mdFileContents += '\n\n# Types';
		mdFileContents += buildClassesDocumentation(protocolClasses);
	}

	return mdFileContents;
}

function buildMethodsTable(protocolMethods) {
	let table = '| Method ID | Method Name |';
	table += '\n| --- | --- |';

	for (const protocolMethod of protocolMethods) {
		const methodID = protocolMethods.indexOf(protocolMethod) + 1;
		const methodHyperlink = `[${protocolMethod.name}](#${methodID}-${protocolMethod.name.toLowerCase()})`;
		
		table += `\n| ${methodID} | ${methodHyperlink} |`;
	}

	return table;
}

function buildMethodDocumentation(protocolMethod, methodID, protocolClasses) {
	let methodDocumentation = `# (${methodID}) ${protocolMethod.name}`;

	let requestDocumentation = '\n\n## Request';

	if (protocolMethod.requestParameters.length === 0) {
		requestDocumentation += '\nThis method does not take any parameters';
	} else {
		requestDocumentation += '\n| Type | Name | Description |';
		requestDocumentation += '\n| --- | --- | --- |';

		for (const requestParameter of protocolMethod.requestParameters) {
			let type = requestParameter.value;

			if (COMMON_TYPE_CONVERSIONS[type]) {
				type = COMMON_TYPE_CONVERSIONS[type];
			}

			if (COMMON_TYPE_LINKS[type]) {
				type = `[${type}](${COMMON_TYPE_LINKS[type]})`;
			}

			// Lists are defined in multiple ways
			if (type.startsWith('std_list<') || type.startsWith('qvector<') || type.startsWith('qlist<')) {
				const listParts = type.split(/[<>]/);
				let listType = listParts[1];
				const listTypeInFile = protocolClasses.some(({ name }) => name === listType);

				if (listTypeInFile) {
					listType = `[${listType}](#${listType.toLowerCase()})`;
				}

				if (COMMON_TYPE_CONVERSIONS[listType]) {
					listType = COMMON_TYPE_CONVERSIONS[listType];
				}

				if (COMMON_TYPE_LINKS[listType]) {
					listType = `[${listType}](${COMMON_TYPE_LINKS[listType]})`;
				}

				type = `[List](${kinnayWikiBase + '/NEX-Common-Types#list'})<${listType}>`;
			}

			const typeInFile = protocolClasses.some(({ name }) => name === type);
			if (typeInFile) {
				type = `[${type}](#${type.toLowerCase()})`;
			}

			requestDocumentation += `\n| ${he.encode(type)} | ${requestParameter.name} |  |`;
		}
	}

	methodDocumentation += requestDocumentation;

	let responseDocumentation = '\n\n## Response';

	if (protocolMethod.responseParameters.length === 0) {
		responseDocumentation += '\nThis method does not return anything';
	} else {
		responseDocumentation += '\n| Type | Name | Description |';
		responseDocumentation += '\n| --- | --- | --- |';

		for (const responseParameter of protocolMethod.responseParameters) {
			let type = responseParameter.value;

			if (COMMON_TYPE_CONVERSIONS[type]) {
				type = COMMON_TYPE_CONVERSIONS[type];
			}

			if (COMMON_TYPE_LINKS[type]) {
				type = `[${type}](${COMMON_TYPE_LINKS[type]})`;
			}

			// Lists are defined in multiple ways
			if (type.startsWith('std_list<') || type.startsWith('qvector<') || type.startsWith('qlist<')) {
				const listParts = type.split(/[<>]/);
				let listType = listParts[1];
				const listTypeInFile = protocolClasses.some(({ name }) => name === listType);

				if (listTypeInFile) {
					listType = `[${listType}](#${listType.toLowerCase()})`;
				}

				if (COMMON_TYPE_CONVERSIONS[listType]) {
					listType = COMMON_TYPE_CONVERSIONS[listType];
				}

				if (COMMON_TYPE_LINKS[listType]) {
					listType = `[${listType}](${COMMON_TYPE_LINKS[listType]})`;
				}

				type = `[List](${kinnayWikiBase + '/NEX-Common-Types#list'})<${listType}>`;
			}

			const typeInFile = protocolClasses.some(({ name }) => name === type);
			if (typeInFile) {
				type = `[${type}](#${type.toLowerCase()})`;
			}

			responseDocumentation += `\n| ${he.encode(type)} | ${responseParameter.name} |  |`;
		}
	}

	methodDocumentation += responseDocumentation;

	return methodDocumentation;
}

function buildClassesDocumentation(protocolClasses) {
	let classesDocumentation = '';

	for (const protocolClass of protocolClasses) {
		const parentClassInFile = protocolClasses.some(({ name }) => name === protocolClass.parentClassName);
		let parentClassName = protocolClass.parentClassName;
		
		if (parentClassInFile) {
			parentClassName = `[${parentClassName}](#${parentClassName.toLowerCase()})`;
		}

		if (COMMON_TYPE_CONVERSIONS[parentClassName]) {
			parentClassName = COMMON_TYPE_CONVERSIONS[parentClassName];
		}

		if (COMMON_TYPE_LINKS[parentClassName]) {
			parentClassName = `[${parentClassName}](${COMMON_TYPE_LINKS[parentClassName]})`;
		}

		let classDocumentation = `\n\n## ${protocolClass.name} (${parentClassName})`;
		classDocumentation += '\n| Name | Type |';
		classDocumentation += '\n| --- | --- |';

		for (const member of protocolClass.members) {
			let memberType = member.type;
			const memberTypeInFile = protocolClasses.some(({ name }) => name === memberType);

			if (memberTypeInFile) {
				memberType = `[${memberType}](#${memberType.toLowerCase()})`;
			}

			if (COMMON_TYPE_CONVERSIONS[memberType]) {
				memberType = COMMON_TYPE_CONVERSIONS[memberType];
			}

			if (COMMON_TYPE_LINKS[memberType]) {
				memberType = `[${memberType}](${COMMON_TYPE_LINKS[memberType]})`;
			}

			// Lists are defined in multiple ways
			if (memberType.startsWith('std_list<') || memberType.startsWith('qvector<') || memberType.startsWith('qlist<')) {
				const listParts = memberType.split(/[<>]/);
				let listType = listParts[1];
				const listTypeInFile = protocolClasses.some(({ name }) => name === listType);

				if (listTypeInFile) {
					listType = `[${listType}](#${listType.toLowerCase()})`;
				}

				if (COMMON_TYPE_CONVERSIONS[listType]) {
					listType = COMMON_TYPE_CONVERSIONS[listType];
				}

				if (COMMON_TYPE_LINKS[listType]) {
					listType = `[${listType}](${COMMON_TYPE_LINKS[listType]})`;
				}

				memberType = `[List](${kinnayWikiBase + '/NEX-Common-Types#list'})<${listType}>`;
			}

			classDocumentation += `\n| ${member.name} | ${he.encode(memberType)} |`;
		}

		classesDocumentation += classDocumentation;
	}

	return classesDocumentation;
}

module.exports = {
	generateDocumentation
};

function isUnicodeSupported() {
	if (process.platform !== 'win32') {
		return process.env.TERM !== 'linux'; // Linux console (kernel)
	}

	return Boolean(process.env.CI)
		|| Boolean(process.env.WT_SESSION) // Windows Terminal
		|| process.env.ConEmuTask === '{cmd::Cmder}' // ConEmu and cmder
		|| process.env.TERM_PROGRAM === 'vscode'
		|| process.env.TERM === 'xterm-256color'
		|| process.env.TERM === 'alacritty'
		|| process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm';
}