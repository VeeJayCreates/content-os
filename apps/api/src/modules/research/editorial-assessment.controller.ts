import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EditorialAssessmentService } from './editorial-assessment.service';

@Controller('opportunities')
export class EditorialAssessmentController {
  constructor(private readonly service: EditorialAssessmentService) {}

  @Post(':id/editorial-assessment')
  assess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.assess(id);
  }

  @Get(':id/editorial-assessment')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.findOne(id); }
}
