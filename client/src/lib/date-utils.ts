export const formatDominicanDateTime = () => {
  const now = new Date();
  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  
  const dominicanTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
  const diaSemana = diasSemana[dominicanTime.getDay()];
  const dia = dominicanTime.getDate();
  const mes = meses[dominicanTime.getMonth()];
  const año = dominicanTime.getFullYear();
  let hora = dominicanTime.getHours();
  const periodo = hora >= 12 ? 'PM' : 'AM';
  hora = hora % 12 || 12;
  
  return `${diaSemana} ${dia} ${mes} ${año} ${hora}:00 ${periodo}`;
};

interface FormatDateRDOptions {
  day?: '2-digit' | 'numeric';
  month?: '2-digit' | 'numeric' | 'long' | 'short';
  year?: '2-digit' | 'numeric';
  hour?: '2-digit' | 'numeric';
  minute?: '2-digit' | 'numeric';
  includeTime?: boolean;
}

export const formatDateRD = (
  date: Date | string | null | undefined,
  options: FormatDateRDOptions = {}
): string => {
  if (!date) return 'Fecha no disponible';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      return 'Fecha no disponible';
    }
    
    const formatOptions: Intl.DateTimeFormatOptions = {
      day: options.day || '2-digit',
      month: options.month || '2-digit',
      year: options.year || 'numeric',
      timeZone: 'America/Santo_Domingo',
    };
    
    if (options.includeTime || options.hour) {
      formatOptions.hour = options.hour || '2-digit';
      formatOptions.minute = options.minute || '2-digit';
      formatOptions.hour12 = true;
    }
    
    if (options.includeTime || options.hour) {
      return dateObj.toLocaleString('es-DO', formatOptions);
    }
    
    return dateObj.toLocaleDateString('es-DO', formatOptions);
  } catch {
    return 'Fecha no disponible';
  }
};
