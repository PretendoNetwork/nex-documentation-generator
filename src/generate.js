const DDL = require('ddl-parser');
const fs = require('fs-extra');

const kinnayWikiBase = 'https://github.com/kinnay/NintendoClients/wiki';

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
				members: classMembers
			})
		}

		if (element.body instanceof DDL.DDLProtocolDeclaration) {
			// Could also be element.body.declaration.unitName.value ?
			protocolName = element.body.declaration.nameSpaceItem.parseTreeItem1.name.value;
			protocolID = 'Unknown ID'; // TODO: Find a way to find this!!

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
		}
	}

	/*------------------------------------------------
	| Now start building a .md file for the protocol |
	------------------------------------------------*/

	const markdown = buildMarkDown(protocolName, protocolID, protocolMethods, protocolClasses);

	fs.ensureDirSync(`${outputPath}`);
	fs.writeFileSync(`${outputPath}/${protocolName}.md`, markdown);
}

function buildMarkDown(protocolName, protocolID, protocolMethods, protocolClasses) {
	let mdFileContents = `## [NEX-Protocols](${kinnayWikiBase}/NEX-Protocols) > ${protocolName} (${protocolID})`;

	const methodsTable = buildMethodsTable(protocolMethods);
	mdFileContents += `\n\n${methodsTable}`;

	for (const protocolMethod of protocolMethods) {
		const methodID = protocolMethods.indexOf(protocolMethod) + 1;
		const methodDocumentation = buildMethodDocumentation(protocolMethod, methodID);
		mdFileContents += `\n\n${methodDocumentation}`;
	}

	if (protocolClasses.length > 0) {
		mdFileContents += '\n\n# Types';
		for (const protocolClass of protocolClasses) {
			const classDocumentation = buildClassDocumentation(protocolClass);
			mdFileContents += `\n\n${classDocumentation}`;
		}
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

function buildMethodDocumentation(protocolMethod, methodID) {
	let methodDocumentation = `# (${methodID}) ${protocolMethod.name}`;

	let requestDocumentation = '\n\n## Request';

	if (protocolMethod.requestParameters.length === 0) {
		requestDocumentation += '\nThis method does not take any parameters';
	} else {
		requestDocumentation += '\n| Type | Name | Description |';
		requestDocumentation += '\n| --- | --- | --- |';

		for (const requestParameter of protocolMethod.requestParameters) {
			requestDocumentation += `\n| ${requestParameter.value} | ${requestParameter.name} |  |`;
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
			responseDocumentation += `\n| ${responseParameter.value} | ${responseParameter.name} |  |`;
		}
	}

	methodDocumentation += responseDocumentation;

	return methodDocumentation;
}

function buildClassDocumentation(protocolClass) {
	let classDocumentation = `## ${protocolClass.name}`;
	classDocumentation += '\n| Name | Type |';
	classDocumentation += '\n| --- | --- |';

	for (const member of protocolClass.members) {
		classDocumentation += `\n| ${member.name} | ${member.type} |`;
	}

	return classDocumentation;
}

module.exports = {
	generateDocumentation
};