import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface JsonTableViewerProps {
  data: string;
  title?: string;
}

interface JsonObject {
  [key: string]: any;
}

export default function JsonTableViewer({ data, title }: JsonTableViewerProps) {
  const parseJsonData = (): JsonObject | null => {
    try {
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getValueType = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
  };

  const getValueColor = (value: any): string => {
    const type = getValueType(value);
    switch (type) {
      case 'boolean':
        return value ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive';
      case 'number':
        return 'bg-blue-500/20 text-blue-600 dark:text-blue-400';
      case 'null':
        return 'bg-muted/20 text-muted-foreground';
      case 'array':
      case 'object':
        return 'bg-purple-500/20 text-purple-600 dark:text-purple-400';
      default:
        return 'bg-muted/20 text-foreground';
    }
  };

  const renderFlatTable = (jsonData: JsonObject) => {
    const entries = Object.entries(jsonData);
    
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Property</TableHead>
            <TableHead className="w-1/6">Type</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key}>
              <TableCell className="font-medium">{key}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {getValueType(value)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className={`inline-block px-2 py-1 rounded text-sm max-w-full break-words ${getValueColor(value)}`}>
                  {formatValue(value)}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const renderArrayTable = (jsonData: any[]) => {
    if (jsonData.length === 0) {
      return <p className="text-muted-foreground text-center py-4">No data available</p>;
    }

    // If array contains objects with consistent structure, render as columns
    if (jsonData.every(item => typeof item === 'object' && item !== null)) {
      const allKeys = new Set<string>();
      jsonData.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });
      const keys = Array.from(allKeys);

      return (
        <Table>
          <TableHeader>
            <TableRow>
              {keys.map(key => (
                <TableHead key={key}>{key}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {jsonData.map((item, index) => (
              <TableRow key={index}>
                {keys.map(key => (
                  <TableCell key={key}>
                    <div className={`inline-block px-2 py-1 rounded text-sm ${getValueColor(item[key])}`}>
                      {formatValue(item[key])}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    // If array contains primitives, render as single column
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/6">Index</TableHead>
            <TableHead className="w-1/6">Type</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jsonData.map((item, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{index}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {getValueType(item)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className={`inline-block px-2 py-1 rounded text-sm ${getValueColor(item)}`}>
                  {formatValue(item)}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const jsonData = parseJsonData();

  if (!jsonData) {
    return (
      <div className="bg-muted rounded-lg p-4">
        <div className="text-center py-4">
          <p className="text-destructive font-medium">Invalid JSON Format</p>
          <p className="text-muted-foreground text-sm mt-1">
            The data could not be parsed as JSON. Displaying as raw text:
          </p>
          <pre className="text-sm whitespace-pre-wrap text-foreground mt-3 bg-background rounded p-3 text-left">
            {data}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Badge variant="outline" className="text-xs">
            {Array.isArray(jsonData) ? `${jsonData.length} items` : `${Object.keys(jsonData).length} properties`}
          </Badge>
        </div>
      )}
      
      <div className="bg-muted rounded-lg p-4 max-h-96 overflow-y-auto scrollbar-thin">
        {Array.isArray(jsonData) ? renderArrayTable(jsonData) : renderFlatTable(jsonData)}
      </div>
    </div>
  );
}