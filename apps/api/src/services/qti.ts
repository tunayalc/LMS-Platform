/**
 * QTI 2.1 Service (Question and Test Interoperability)
 * Import/Export assessment items in IMS QTI format
 */

import { parseStringPromise, Builder } from 'xml2js';
import AdmZip from 'adm-zip';
import { query } from '../db';
import { randomUUID } from 'crypto';

// QTI Item Types
type QtiInteractionType =
    | 'choiceInteraction'
    | 'orderInteraction'
    | 'matchInteraction'
    | 'textEntryInteraction'
    | 'extendedTextInteraction'
    | 'inlineChoiceInteraction'
    | 'hottextInteraction'
    | 'hotspotInteraction';

interface QtiChoice {
    identifier: string;
    value: string;
}

interface QtiQuestion {
    identifier: string;
    title: string;
    type: QtiInteractionType;
    prompt: string;
    choices?: QtiChoice[];
    correctResponse?: string | string[];
    maxScore?: number;
    feedback?: {
        correct?: string;
        incorrect?: string;
    };
}

interface QtiAssessment {
    identifier: string;
    title: string;
    items: QtiQuestion[];
}

export const QtiService = {
    /**
     * Parse QTI 2.1 XML to internal format
     */
    parseQtiXml: async (xmlContent: string): Promise<QtiAssessment | null> => {
        try {
            const result = await parseStringPromise(xmlContent, { explicitArray: false });

            // Handle both assessmentItem and assessmentTest
            if (result.assessmentItem) {
                return {
                    identifier: result.assessmentItem.$.identifier,
                    title: result.assessmentItem.$.title,
                    items: [QtiService.parseAssessmentItem(result.assessmentItem)]
                };
            }

            if (result.assessmentTest) {
                const items: QtiQuestion[] = [];
                const sections = result.assessmentTest.testPart?.assessmentSection;

                if (Array.isArray(sections)) {
                    for (const section of sections) {
                        if (section.assessmentItemRef) {
                            // Would need to load referenced items
                        }
                    }
                }

                return {
                    identifier: result.assessmentTest.$.identifier,
                    title: result.assessmentTest.$.title,
                    items
                };
            }

            return null;
        } catch (error) {
            console.error('QTI Parse Error:', error);
            return null;
        }
    },

    /**
     * Parse single assessment item
     */
    parseAssessmentItem: (item: any): QtiQuestion => {
        const body = item.itemBody;
        let type: QtiInteractionType = 'choiceInteraction';
        let prompt = '';
        let choices: QtiChoice[] = [];
        let correctResponse: string | string[] = '';

        // Detect interaction type
        if (body.choiceInteraction) {
            type = 'choiceInteraction';
            const interaction = body.choiceInteraction;
            prompt = interaction.prompt?._ || interaction.prompt || '';

            const simpleChoices = interaction.simpleChoice;
            if (Array.isArray(simpleChoices)) {
                choices = simpleChoices.map((c: any) => ({
                    identifier: c.$.identifier,
                    value: c._ || c
                }));
            }
        } else if (body.orderInteraction) {
            type = 'orderInteraction';
        } else if (body.matchInteraction) {
            type = 'matchInteraction';
        } else if (body.textEntryInteraction) {
            type = 'textEntryInteraction';
        } else if (body.extendedTextInteraction) {
            type = 'extendedTextInteraction';
        }

        // Get correct response
        if (item.responseDeclaration?.correctResponse) {
            const resp = item.responseDeclaration.correctResponse.value;
            correctResponse = Array.isArray(resp) ? resp : [resp];
        }

        return {
            identifier: item.$.identifier,
            title: item.$.title || item.$.identifier,
            type,
            prompt,
            choices,
            correctResponse,
            maxScore: parseFloat(item.outcomeDeclaration?.defaultValue?.value) || 1
        };
    },

    /**
     * Convert internal question to QTI 2.1 XML
     */
    generateQtiXml: (question: QtiQuestion): string => {
        const builder = new Builder({
            rootName: 'assessmentItem',
            headless: false,
            xmldec: { version: '1.0', encoding: 'UTF-8' }
        });

        const qtiItem: any = {
            $: {
                xmlns: 'http://www.imsglobal.org/xsd/imsqti_v2p1',
                identifier: question.identifier,
                title: question.title,
                adaptive: 'false',
                timeDependent: 'false'
            },
            responseDeclaration: {
                $: { identifier: 'RESPONSE', cardinality: 'single', baseType: 'identifier' },
                correctResponse: {
                    value: Array.isArray(question.correctResponse)
                        ? question.correctResponse[0]
                        : question.correctResponse
                }
            },
            outcomeDeclaration: {
                $: { identifier: 'SCORE', cardinality: 'single', baseType: 'float' },
                defaultValue: { value: '0' }
            },
            itemBody: {}
        };

        // Build interaction based on type
        if (question.type === 'choiceInteraction' && question.choices) {
            qtiItem.itemBody.choiceInteraction = {
                $: { responseIdentifier: 'RESPONSE', shuffle: 'true', maxChoices: '1' },
                prompt: question.prompt,
                simpleChoice: question.choices.map(c => ({
                    $: { identifier: c.identifier },
                    _: c.value
                }))
            };
        } else if (question.type === 'textEntryInteraction') {
            qtiItem.itemBody = {
                p: [
                    question.prompt,
                    { textEntryInteraction: { $: { responseIdentifier: 'RESPONSE', expectedLength: '50' } } }
                ]
            };
        }

        // Response processing
        qtiItem.responseProcessing = {
            $: { template: 'http://www.imsglobal.org/question/qti_v2p1/rptemplates/match_correct' }
        };

        return builder.buildObject(qtiItem);
    },

    /**
     * Export exam to QTI 2.1 package
     */
    exportExamToQti: async (examId: string): Promise<string> => {
        // In production: Fetch exam and questions from database
        // Return ZIP package with manifest and item XMLs

        const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="MANIFEST-${examId}">
  <organizations>
    <organization identifier="ORG-1" structure="hierarchical">
      <title>Exam Export</title>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="imsqti_item_xmlv2p1" href="items/item1.xml"/>
  </resources>
</manifest>`;

        return manifest;
    },

    /**
     * Import QTI package and create questions
     */
    importQtiPackage: async (packageContent: Buffer, courseId: string): Promise<{ imported: number; errors: string[] }> => {
        const errors: string[] = [];
        let imported = 0;

        try {
            const zip = new AdmZip(packageContent);
            const zipEntries = zip.getEntries();

            // 1. Find and parse manifest
            const manifestEntry = zipEntries.find(entry => entry.entryName === 'imsmanifest.xml');
            if (!manifestEntry) {
                return { imported: 0, errors: ['Invalid QTI package: imsmanifest.xml not found'] };
            }

            const manifestXml = manifestEntry.getData().toString('utf8');
            const manifest = await parseStringPromise(manifestXml, { explicitArray: false });

            // 2. Identify Resources
            const resources = manifest.manifest?.resources?.resource;
            const resourceList = Array.isArray(resources) ? resources : (resources ? [resources] : []);

            for (const res of resourceList) {
                if (res.$.type === 'imsqti_item_xmlv2p1' || res.$.type.includes('imsqti')) {
                    const href = res.$.href;
                    // Try exact match or relative path match
                    const itemEntry = zipEntries.find(e => e.entryName === href || e.entryName.endsWith(href));

                    if (itemEntry) {
                        try {
                            const itemXml = itemEntry.getData().toString('utf8');
                            // Use our existing parse helper
                            const qtiQuestion = QtiService.parseAssessmentItem(
                                (await parseStringPromise(itemXml, { explicitArray: false })).assessmentItem
                            );

                            if (qtiQuestion) {
                                // 3. Save to DB
                                // Map QTI type to our internal type
                                const internalType = QtiService.mapQtiTypeToInternal(qtiQuestion.type);

                                // Construct meta/options based on type
                                let options: string[] = [];
                                let answer = qtiQuestion.correctResponse;

                                if (qtiQuestion.choices) {
                                    options = qtiQuestion.choices.map(c => c.value);
                                }

                                await query(
                                    `INSERT INTO questions (id, course_id, type, prompt, options, answer, points, created_at, updated_at)
                                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                                    [
                                        randomUUID(),
                                        courseId,
                                        internalType,
                                        qtiQuestion.prompt,
                                        JSON.stringify(options),
                                        JSON.stringify(answer),
                                        qtiQuestion.maxScore || 1
                                    ]
                                );
                                imported++;
                            }
                        } catch (err: any) {
                            errors.push(`Failed to import item ${href}: ${err.message}`);
                        }
                    }
                }
            }

        } catch (error: any) {
            console.error('QTI Import Error:', error);
            errors.push(`Fatal error: ${error.message}`);
        }

        return { imported, errors };
    },

    /**
     * Map QTI type to internal question type
     */
    mapQtiTypeToInternal: (qtiType: QtiInteractionType): string => {
        const mapping: Record<QtiInteractionType, string> = {
            'choiceInteraction': 'multiple_choice',
            'orderInteraction': 'ordering',
            'matchInteraction': 'matching',
            'textEntryInteraction': 'fill_blank',
            'extendedTextInteraction': 'long_answer',
            'inlineChoiceInteraction': 'fill_blank',
            'hottextInteraction': 'hotspot',
            'hotspotInteraction': 'hotspot'
        };
        return mapping[qtiType] || 'short_answer';
    }
};

export default QtiService;
