import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle } from "lucide-react";

interface TaskQualityAssessmentProps {
  data: string;
}

interface QualityAssessmentItem {
  property: string;
  passed: boolean;
  explanation: string;
}

export default function TaskQualityAssessment({ data }: TaskQualityAssessmentProps) {
  const parseQualityData = (): QualityAssessmentItem[] => {
    try {
      const jsonData = JSON.parse(data);
      
      // Handle different possible JSON structures
      const items: QualityAssessmentItem[] = [];
      
      // If it's an array of objects
      if (Array.isArray(jsonData)) {
        return jsonData.map(item => ({
          property: item.property || item.criterion || item.name || 'Unknown',
          passed: item.passed || item.success || item.status === 'passed' || false,
          explanation: item.explanation || item.description || item.reason || item.message || 'No explanation provided'
        }));
      }
      
      // If it's an object with properties
      if (typeof jsonData === 'object' && jsonData !== null) {
        // Check if it has a results or assessments array
        if (jsonData.results && Array.isArray(jsonData.results)) {
          return jsonData.results.map((item: any) => ({
            property: item.property || item.criterion || item.name || 'Unknown',
            passed: item.passed || item.success || item.status === 'passed' || false,
            explanation: item.explanation || item.description || item.reason || item.message || 'No explanation provided'
          }));
        }
        
        if (jsonData.assessments && Array.isArray(jsonData.assessments)) {
          return jsonData.assessments.map((item: any) => ({
            property: item.property || item.criterion || item.name || 'Unknown',
            passed: item.passed || item.success || item.status === 'passed' || false,
            explanation: item.explanation || item.description || item.reason || item.message || 'No explanation provided'
          }));
        }
        
        // If it's a flat object, convert each key-value pair
        return Object.entries(jsonData).map(([key, value]: [string, any]) => {
          if (typeof value === 'object' && value !== null) {
            return {
              property: key,
              passed: value.passed || value.success || value.status === 'passed' || false,
              explanation: value.explanation || value.description || value.reason || value.message || JSON.stringify(value)
            };
          } else {
            return {
              property: key,
              passed: value === true || value === 'passed' || value === 'success',
              explanation: String(value)
            };
          }
        });
      }
      
      return [];
    } catch (error) {
      return [];
    }
  };

  const qualityItems = parseQualityData();

  if (qualityItems.length === 0) {
    return (
      <div className="bg-muted rounded-lg p-4">
        <div className="text-center py-4">
          <p className="text-destructive font-medium">Unable to Parse Quality Assessment</p>
          <p className="text-muted-foreground text-sm mt-1">
            The data format is not recognized. Displaying as raw text:
          </p>
          <pre className="text-sm whitespace-pre-wrap text-foreground mt-3 bg-background rounded p-3 text-left">
            {data}
          </pre>
        </div>
      </div>
    );
  }

  const passedCount = qualityItems.filter(item => item.passed).length;
  const totalCount = qualityItems.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Quality Assessment Results</h3>
        <div className="text-sm text-muted-foreground">
          {passedCount} of {totalCount} criteria passed
        </div>
      </div>
      
      <div className="bg-muted rounded-lg p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/4">Property</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
              <TableHead>Explanation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qualityItems.map((item, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">
                  {item.property}
                </TableCell>
                <TableCell className="text-center">
                  {item.passed ? (
                    <CheckCircle className="h-5 w-5 text-success mx-auto" data-testid={`status-passed-${index}`} />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive mx-auto" data-testid={`status-failed-${index}`} />
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {item.explanation}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-success" />
          <span>{passedCount} Passed</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive" />
          <span>{totalCount - passedCount} Failed</span>
        </div>
      </div>
    </div>
  );
}