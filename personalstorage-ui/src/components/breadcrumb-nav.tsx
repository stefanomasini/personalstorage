import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Fragment } from 'react';

interface BreadcrumbNavProps {
    path: string;
    onNavigate: (path: string) => void;
}

export function BreadcrumbNav({ path, onNavigate }: BreadcrumbNavProps) {
    const segments = path ? path.split('/').filter(Boolean) : [];

    return (
        <Breadcrumb>
            <BreadcrumbList>
                <BreadcrumbItem>
                    <BreadcrumbLink
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            onNavigate('/');
                        }}
                    >
                        /
                    </BreadcrumbLink>
                </BreadcrumbItem>
                {segments.map((segment, i) => {
                    const segPath = '/' + segments.slice(0, i + 1).join('/');
                    return (
                        <Fragment key={segPath}>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onNavigate(segPath);
                                    }}
                                >
                                    {segment}
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                        </Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
