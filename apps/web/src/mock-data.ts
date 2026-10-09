import type { StudyQuestion, Subject, Topic } from './types';
export interface MockQuestion extends StudyQuestion {
  subjectId: string;
  topicId: string;
  topicName: string;
  correctOptionId: string;
  explanation: string;
}
// Frontend-owned fictional fixtures. Never imported from server or database code.
export const mockQuestions: MockQuestion[] = [
  {
    id: '10000000-0000-4000-8000-000000000001', subject: 'Biochemistry', subjectId: '20000000-0000-4000-8000-000000000001',
    topicId: '30000000-0000-4000-8000-000000000001', topicName: 'Enzyme kinetics', difficulty: 'MEDIUM',
    prompt: 'In a fictional laboratory vignette, a researcher adds a reversible competitive inhibitor to an enzyme assay. Which change in enzyme kinetics is expected?',
    options: [
      { id: '40000000-0000-4000-8000-000000000011', text: 'Increased apparent Km, unchanged Vmax' },
      { id: '40000000-0000-4000-8000-000000000012', text: 'Unchanged Km, decreased Vmax' },
      { id: '40000000-0000-4000-8000-000000000013', text: 'Decreased Km, decreased Vmax' },
      { id: '40000000-0000-4000-8000-000000000014', text: 'Increased Km, increased Vmax' },
    ], correctOptionId: '40000000-0000-4000-8000-000000000011',
    explanation: 'A competitive inhibitor competes for the active site. More substrate is needed to reach half the maximal velocity, increasing apparent Km. Sufficient substrate can overcome inhibition, so Vmax is unchanged.',
  },
  {
    id: '10000000-0000-4000-8000-000000000002', subject: 'Cell biology', subjectId: '20000000-0000-4000-8000-000000000002',
    topicId: '30000000-0000-4000-8000-000000000002', topicName: 'Protein trafficking', difficulty: 'MEDIUM',
    prompt: 'In a fictional cell-culture experiment, a student labels a newly synthesized secreted protein. After leaving the rough endoplasmic reticulum, the protein is modified and sorted into secretory vesicles. Which organelle performs these steps?',
    options: [
      { id: '40000000-0000-4000-8000-000000000021', text: 'Mitochondrion' }, { id: '40000000-0000-4000-8000-000000000022', text: 'Golgi apparatus' },
      { id: '40000000-0000-4000-8000-000000000023', text: 'Nucleolus' }, { id: '40000000-0000-4000-8000-000000000024', text: 'Peroxisome' },
    ], correctOptionId: '40000000-0000-4000-8000-000000000022',
    explanation: 'The Golgi apparatus modifies and sorts proteins received from the endoplasmic reticulum, then packages them into vesicles for their destinations, including secretion.',
  },
  {
    id: '10000000-0000-4000-8000-000000000003', subject: 'Genetics', subjectId: '20000000-0000-4000-8000-000000000003',
    topicId: '30000000-0000-4000-8000-000000000003', topicName: 'Autosomal recessive inheritance', difficulty: 'MEDIUM',
    prompt: 'In a fictional genetics counseling vignette, two unaffected parents are both heterozygous carriers of the same autosomal recessive condition. What is the probability that a child inherits two copies of the recessive allele?',
    options: [
      { id: '40000000-0000-4000-8000-000000000031', text: '0%' }, { id: '40000000-0000-4000-8000-000000000032', text: '25%' },
      { id: '40000000-0000-4000-8000-000000000033', text: '50%' }, { id: '40000000-0000-4000-8000-000000000034', text: '75%' },
    ], correctOptionId: '40000000-0000-4000-8000-000000000032',
    explanation: 'For an Aa × Aa cross, the expected genotypes are AA, Aa, Aa, and aa. One of four outcomes has two recessive alleles. The probability is 25% for each pregnancy.',
  },
];
export const mockSubjects: Subject[] = mockQuestions.map(question => ({ id: question.subjectId, name: question.subject }));
export const mockTopics: Topic[] = mockQuestions.map(question => ({ id: question.topicId, subjectId: question.subjectId, name: question.topicName }));
