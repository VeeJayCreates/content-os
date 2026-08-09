import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { ListSignalsDto } from './dto/list-signals.dto';
import { SignalService } from './signal.service';

@Controller('signals')
export class SignalController {
  constructor(private readonly signalService: SignalService) {}

  @Get()
  getAll(@Query() query: ListSignalsDto) {
    return this.signalService.findAll(query);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.signalService.findOne(id);
  }
}
